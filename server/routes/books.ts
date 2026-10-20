import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { requireAuth, requireAdmin, getIdentity } from '../auth.ts';
import { listBookHoldings, registerBookHolding } from '../book-holdings.ts';
import type { MasterSource } from '../master/source.ts';

/** @implements SPEC-BB-HOLDINGS-001 */
export function makeBookRouter(db: Database.Database, master: MasterSource): Hono {
  const r = new Hono();
  r.use('*', requireAuth);
  r.use('*', async (c, next) => {
    c.header('cache-control', 'private, no-store');
    await next();
  });
  r.get('/', c => c.json({ items: listBookHoldings(db) }));
  r.post('/', requireAdmin, async c => {
    const body: unknown = await c.req.json().catch(() => null);
    const isbn = body && typeof body === 'object' && 'isbn' in body ? body.isbn : null;
    if (typeof isbn !== 'string' || !/^[0-9Xx -]{10,20}$/.test(isbn)) {
      return c.json({ error: 'invalid_isbn' }, 400);
    }
    const meta = await master.lookupBook(isbn.replace(/[ -]/g, ''));
    if (!meta) return c.json({ error: 'book_not_found' }, 404);
    registerBookHolding(db, meta.isbn, getIdentity(c).userId);
    return c.json({ isbn: meta.isbn }, 201);
  });
  return r;
}
