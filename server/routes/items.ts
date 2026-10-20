// /api/items — アイテムマスタの照会。
//
// 書籍 (ISBN) : 読み取り専用 (OpenBD 経由)。 中身を持たないので登録は不要。
// 機材 (QR)   : Cc の執行役員由来の検証済みインポートで追加する。

import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { requireAdmin, requireAuth } from '../auth.ts';
import {
  listEquipment,


} from '../db.ts';
import type { MasterSource } from '../master/source.ts';
import { makeBookRouter } from './books.ts';

export function makeItemRouter(
  db: Database.Database,
  master: MasterSource,
): Hono {
  const r = new Hono();
  r.route('/books', makeBookRouter(db, master));

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

  // Equipment intake is exclusively the verified Cc operator import.
  r.post('/equipment', requireAuth, c => c.json({ error: 'executive_cc_import_required' }, 403));
  r.post('/equipment/bulk', requireAuth, c => c.json({ error: 'executive_cc_import_required' }, 403));

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
