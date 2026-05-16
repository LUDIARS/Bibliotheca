// /api/loans — 貸出 / 返却 / 一覧。
//
// 貸出は本人が自分の名前で行う (Cernere identity から userId を確定)。
// 返却は **admin role のみ** 実行可能。 admin が物理確認したうえで返却フラグを立てる。

import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { requireAdmin, requireAuth, getIdentity } from '../auth.ts';
import {
  createLoan,
  findOpenLoan,
  listLoansForUser,
  listOpenLoans,
  markReturned,
  type ItemSource,
  type LoanRow,
} from '../db.ts';
import type { MasterSource } from '../master/source.ts';

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

export function makeLoanRouter(
  db: Database.Database,
  master: MasterSource,
): Hono {
  const r = new Hono();

  // 貸出中一覧 (管理者画面 + 一般ユーザの「誰が借りているか」両用)
  r.get('/open', requireAuth, async (c) => {
    const rows = listOpenLoans(db);
    const items = await decorate(rows, master);
    return c.json({ items });
  });

  // 自分の貸出履歴
  r.get('/mine', requireAuth, async (c) => {
    const id = getIdentity(c);
    const includeReturned = c.req.query('all') === '1';
    const rows = listLoansForUser(db, id.userId, includeReturned);
    const items = await decorate(rows, master);
    return c.json({ items });
  });

  // 貸出 (本人操作)
  r.post('/', requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { source?: string; external_key?: string; due_at?: string | null; note?: string | null }
      | null;
    if (!body) return c.json({ error: 'bad_json' }, 400);
    const source = body.source;
    if (source !== 'book' && source !== 'equipment') {
      return c.json({ error: 'bad_source' }, 400);
    }
    const externalKey = body.external_key;
    if (!externalKey) return c.json({ error: 'bad_external_key' }, 400);

    // マスタに存在するか確認 (= 未登録機材は貸し出せない)
    if (source === 'book') {
      const meta = await master.lookupBook(externalKey);
      if (!meta) return c.json({ error: 'book_not_found' }, 404);
    } else {
      const meta = await master.lookupEquipment(externalKey);
      if (!meta) return c.json({ error: 'equipment_not_registered' }, 404);
    }

    // 同一物の二重貸し出し防止
    const existing = findOpenLoan(db, source as ItemSource, externalKey);
    if (existing) {
      return c.json({ error: 'already_borrowed', loan: existing }, 409);
    }

    const id = getIdentity(c);
    const loan = createLoan(db, {
      source: source as ItemSource,
      externalKey,
      borrowerUserId: id.userId,
      borrowerDisplayName: id.displayName,
      dueAt: body.due_at ?? null,
      note: body.note ?? null,
    });
    return c.json({ loan }, 201);
  });

  // 返却 — admin 専用
  r.post('/:id/return', requireAuth, requireAdmin, (c) => {
    const loanId = Number(c.req.param('id'));
    if (!Number.isFinite(loanId)) return c.json({ error: 'bad_id' }, 400);
    const admin = getIdentity(c);
    const updated = markReturned(db, loanId, admin.userId);
    if (!updated) return c.json({ error: 'not_open_or_missing' }, 404);
    return c.json({ loan: updated });
  });

  return r;
}
