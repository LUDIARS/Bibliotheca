// /api/items — アイテムマスタの照会と機材ローカル登録。
//
// 書籍 (ISBN) : 読み取り専用 (OpenBD 経由)。 中身を持たないので登録は不要。
// 機材 (QR)   : マスタ DB が無いので Bibliotheca のローカルテーブルに admin が登録する。

import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { requireAdmin, requireAuth, getIdentity } from '../auth.ts';
import {
  listEquipment,
  upsertEquipment,
} from '../db.ts';
import type { MasterSource } from '../master/source.ts';

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

  // 機材登録 / 更新 — admin 専用
  r.post('/equipment', requireAuth, requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { qr_code?: string; name?: string; spec?: string | null }
      | null;
    if (!body || !body.qr_code || !body.name) {
      return c.json({ error: 'qr_code_and_name_required' }, 400);
    }
    const id = getIdentity(c);
    const row = upsertEquipment(db, {
      qrCode: body.qr_code,
      name: body.name,
      spec: body.spec ?? null,
      addedByUserId: id.userId,
    });
    return c.json({ equipment: row }, 201);
  });

  return r;
}
