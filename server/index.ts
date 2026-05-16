// Bibliotheca server entry — Hono + better-sqlite3 + Cernere PASETO V4。
//
// 起動シーケンス:
//   1. env / dirs を解決
//   2. SQLite 開いて schema 適用
//   3. MasterSource (OpenBD + ローカル機材) を組み立て
//   4. Cernere 公開鍵 fetch ループ start
//   5. router を mount → listen

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from './db.ts';
import { startAuth } from './auth.ts';
import { CompositeMasterSource } from './master/composite.ts';
import { OpenBdSource } from './master/openbd.ts';
import { LocalEquipmentSource } from './master/local-equipment.ts';
import { makeItemRouter } from './routes/items.ts';
import { makeLoanRouter } from './routes/loans.ts';
import { makeMeRouter } from './routes/me.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.BIBLIOTHECA_PORT ?? 17500);
const DATA_DIR = resolve(
  process.env.BIBLIOTHECA_DATA ?? join(__dirname, '..', 'data'),
);
const DB_PATH = join(DATA_DIR, 'bibliotheca.db');
const CERNERE_BASE_URL =
  process.env.CERNERE_BASE_URL ?? 'http://localhost:8080';
const AUDIENCE =
  process.env.BIBLIOTHECA_PUBLIC_URL ?? `http://localhost:${PORT}`;
const ADMIN_IDS = new Set(
  (process.env.BIBLIOTHECA_ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const db = openDb(DB_PATH);
startAuth({
  cernereBaseUrl: CERNERE_BASE_URL,
  audience: AUDIENCE,
  adminIds: ADMIN_IDS,
});

const master = new CompositeMasterSource([
  new OpenBdSource(db),
  new LocalEquipmentSource(db),
]);

const app = new Hono();
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'bibliotheca', port: PORT }),
);

app.route('/api/me', makeMeRouter());
app.route('/api/items', makeItemRouter(db, master));
app.route('/api/loans', makeLoanRouter(db, master));

// serveStatic は cwd 相対なので、 npm scripts は repo root から起動する前提。
app.use('/*', serveStatic({ root: './public' }));
app.get('/', serveStatic({ path: './public/index.html' }));
app.notFound((c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith('/api/')) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.redirect('/');
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[bibliotheca] listening on http://localhost:${info.port}`);
  console.log(`[bibliotheca] data dir: ${DATA_DIR}`);
  console.log(`[bibliotheca] admin user ids: ${ADMIN_IDS.size}`);
});
