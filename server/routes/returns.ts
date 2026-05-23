// /api/returns — 返却ランデブー (ゲスト QR 発行 + admin スキャン確定)。
//
// フロー:
//   1. guest (= borrower) が GET /api/returns/token を叩いて短命 token を発行
//   2. guest の Web 画面が token を QR で表示 (60s で自動更新)
//   3. admin が QR をスキャン → POST /api/returns/lookup で guest の open loans 取得
//   4. admin が check + 確定 → POST /api/returns/confirm で複数 loan を一括返却
//
// 設計判断:
//   - token は server 側生成のランダム 32 byte hex (= 64 char)。 HMAC ではなく
//     return_token テーブルで台帳管理 → 単回消費 (consumed_at) + 強制 revoke が容易
//   - TTL 60s (短命)。 guest UI 側は 50s 経過で自動再発行する想定
//   - admin が lookup した時点では消費しない (= ゲストが「何返すか」 admin と相談中
//     も同じ token を使い回せる)。 consume するのは confirm 時のみ

import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { requireAdmin, requireAuth, getIdentity } from '../auth.ts';
import {
  consumeReturnToken,
  findValidReturnToken,
  issueReturnToken,
  listLoansForUser,
  markReturned,
  pruneExpiredReturnTokens,
  type LoanRow,
} from '../db.ts';
import type { MasterSource } from '../master/source.ts';

const TOKEN_TTL_SECONDS = 60;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

interface LoanView extends LoanRow {
  label: string | null;
}

async function decorate(
  rows: LoanRow[],
  master: MasterSource,
): Promise<LoanView[]> {
  const out: LoanView[] = [];
  for (const row of rows) {
    let label: string | null = null;
    if (row.source === 'book') {
      const meta = await master.lookupBook(row.external_key);
      label = meta?.title ?? null;
    } else {
      const meta = await master.lookupEquipment(row.external_key);
      label = meta?.name ?? null;
    }
    out.push({ ...row, label });
  }
  return out;
}

export function makeReturnRouter(
  db: Database.Database,
  master: MasterSource,
): Hono {
  // 起動時 + 5min 毎に expired token を掃除 (登録直後の token が残るのは無害だが
  // 履歴肥大を防ぐ程度)
  pruneExpiredReturnTokens(db);
  const timer = setInterval(() => pruneExpiredReturnTokens(db), PRUNE_INTERVAL_MS);
  timer.unref?.();

  const r = new Hono();

  // ── ゲスト: 自分用の返却 token を発行 ──────────────────────────────
  r.post('/token', requireAuth, (c) => {
    const id = getIdentity(c);
    const token = randomBytes(24).toString('base64url'); // 32 char URL-safe
    const row = issueReturnToken(db, {
      token,
      userId: id.userId,
      displayName: id.displayName,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
    return c.json({
      token: row.token,
      expiresAt: row.expires_at,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
  });

  // ── admin: スキャン後に token を解決して open loans を返す ─────────
  r.post('/lookup', requireAuth, requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { token?: string }
      | null;
    if (!body?.token) return c.json({ error: 'bad_json' }, 400);
    const row = findValidReturnToken(db, body.token);
    if (!row) return c.json({ error: 'token_invalid_or_expired' }, 404);
    const loans = listLoansForUser(db, row.user_id, false);
    const items = await decorate(loans, master);
    return c.json({
      borrower: {
        userId: row.user_id,
        displayName: row.display_name,
      },
      tokenExpiresAt: row.expires_at,
      openLoans: items,
    });
  });

  // ── admin: 選択された loan を一括返却 + token 消費 ─────────────────
  r.post('/confirm', requireAuth, requireAdmin, async (c) => {
    const adminId = getIdentity(c);
    const body = (await c.req.json().catch(() => null)) as
      | { token?: string; loanIds?: unknown }
      | null;
    if (!body?.token) return c.json({ error: 'bad_json' }, 400);
    const loanIds = Array.isArray(body.loanIds)
      ? body.loanIds.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    if (loanIds.length === 0) return c.json({ error: 'no_loans_selected' }, 400);

    const row = findValidReturnToken(db, body.token);
    if (!row) return c.json({ error: 'token_invalid_or_expired' }, 404);

    // 選択された loan が guest 本人のものか確認 + 返却処理
    const ownedOpen = new Set(
      listLoansForUser(db, row.user_id, false).map((l) => l.id),
    );
    const returned: LoanRow[] = [];
    const skipped: number[] = [];
    for (const id of loanIds) {
      if (!ownedOpen.has(id)) {
        skipped.push(id);
        continue;
      }
      const updated = markReturned(db, id, adminId.userId);
      if (updated) returned.push(updated);
      else skipped.push(id);
    }

    if (returned.length === 0) {
      return c.json({ error: 'no_loans_returned', skipped }, 400);
    }

    // 全て成功した場合のみ token を単回消費 (= 部分失敗時はリトライ可)
    if (skipped.length === 0) consumeReturnToken(db, body.token);

    return c.json({
      returned: await decorate(returned, master),
      skipped,
      tokenConsumed: skipped.length === 0,
    });
  });

  return r;
}
