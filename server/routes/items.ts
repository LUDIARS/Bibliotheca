// /api/items — アイテムマスタの照会と機材ローカル登録。
//
// 書籍 (ISBN) : 読み取り専用 (OpenBD 経由)。 中身を持たないので登録は不要。
// 機材 (QR)   : マスタ DB が無いので Bibliotheca のローカルテーブルに admin が登録する。

import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { requireAdmin, requireAuth, getIdentity } from '../auth.ts';
import {
  listEquipment,
  upsertEquipment,
  type EquipmentRow,
} from '../db.ts';
import type { MasterSource } from '../master/source.ts';

/** 新規 QR を発行。 `BB-` プレフィクス + 10 文字 base36 (= 機材判定が一目で分かる)。 */
function generateQrCode(): string {
  const buf = randomBytes(8);
  // base36 で 0-9a-z にして 10 桁に揃える
  const enc = BigInt('0x' + buf.toString('hex')).toString(36).padStart(13, '0').slice(-10);
  return 'BB-' + enc.toUpperCase();
}

export function makeItemRouter(
  db: Database.Database,
  master: MasterSource,
): Hono {
  const r = new Hono();

  // 任意の external_key の中身を引く (book/equipment 両対応)
  r.get('/lookup', requireAuth, async (c) => {
    const source = c.req.query('source');
    const key = c.req.query('key');
    if (source !== 'book' && source !== 'equipment') {
      return c.json({ error: 'bad_source' }, 400);
    }
    if (!key) return c.json({ error: 'bad_key' }, 400);
    if (source === 'book') {
      const meta = await master.lookupBook(key);
      return meta ? c.json({ source, meta }) : c.json({ error: 'not_found' }, 404);
    }
    const meta = await master.lookupEquipment(key);
    return meta ? c.json({ source, meta }) : c.json({ error: 'not_found' }, 404);
  });

  // 機材一覧 (admin が登録した機材マスタ)
  r.get('/equipment', requireAuth, (c) => {
    const rows = listEquipment(db);
    return c.json({ items: rows });
  });

  // 機材登録 / 更新 — admin 専用。 qr_code 空欄なら自動発行。
  r.post('/equipment', requireAuth, requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { qr_code?: string; name?: string; spec?: string | null }
      | null;
    if (!body || !body.name) {
      return c.json({ error: 'name_required' }, 400);
    }
    const id = getIdentity(c);
    const qrCode = body.qr_code && body.qr_code.trim() ? body.qr_code.trim() : generateQrCode();
    const row = upsertEquipment(db, {
      qrCode,
      name: body.name,
      spec: body.spec ?? null,
      addedByUserId: id.userId,
    });
    return c.json({ equipment: row, generated_qr: !body.qr_code }, 201);
  });

  // 機材を CSV (= 配列) で一括登録 — admin 専用。
  // qr_code 空欄行は自動発行、 重複行は upsert (name/spec 上書き)。
  r.post('/equipment/bulk', requireAuth, requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { items?: Array<{ qr_code?: string; name?: string; spec?: string | null }> }
      | null;
    if (!body || !Array.isArray(body.items)) {
      return c.json({ error: 'items_required' }, 400);
    }
    const id = getIdentity(c);
    const result: Array<{ ok: true; equipment: EquipmentRow; generated_qr: boolean } | { ok: false; index: number; error: string }> = [];
    body.items.forEach((it, idx) => {
      if (!it || typeof it.name !== 'string' || !it.name.trim()) {
        result.push({ ok: false, index: idx, error: 'name_required' });
        return;
      }
      try {
        const qrCode = it.qr_code && it.qr_code.trim() ? it.qr_code.trim() : generateQrCode();
        const row = upsertEquipment(db, {
          qrCode,
          name: it.name.trim(),
          spec: (it.spec && it.spec.trim()) ? it.spec.trim() : null,
          addedByUserId: id.userId,
        });
        result.push({ ok: true, equipment: row, generated_qr: !it.qr_code });
      } catch (e) {
        result.push({ ok: false, index: idx, error: (e as Error).message });
      }
    });
    const okCount = result.filter((r) => r.ok).length;
    const errCount = result.length - okCount;
    return c.json({ ok: okCount, errors: errCount, results: result }, 201);
  });

  // 書籍 ISBN 一覧をまとめて OpenBD で warm cache。 admin 限定 (= 外部 API 叩くので)。
  r.post('/books/bulk', requireAuth, requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { isbns?: string[] } | null;
    if (!body || !Array.isArray(body.isbns)) {
      return c.json({ error: 'isbns_required' }, 400);
    }
    const results: Array<{ isbn: string; ok: boolean; title?: string }> = [];
    for (const raw of body.isbns) {
      if (typeof raw !== 'string') {
        results.push({ isbn: String(raw), ok: false });
        continue;
      }
      const meta = await master.lookupBook(raw);
      if (meta) {
        results.push({ isbn: meta.isbn, ok: true, title: meta.title });
      } else {
        results.push({ isbn: raw, ok: false });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return c.json({ ok: okCount, total: results.length, results });
  });

  return r;
}
