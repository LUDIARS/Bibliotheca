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

/** 必須 env を取り出す。 未設定なら落とす (= localhost 等の暗黙 fallback は禁止)。 */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(
      `[bibliotheca] ${name} が未設定です。 Infisical / .env.secrets / .env / host env のいずれかで指定してください。`,
    );
    process.exit(1);
  }
  return v.trim();
}

// listen port / data dir は値が無くてもサービスとして成立するので default 容認 (= 純粋な dev utility)
const PORT = Number(process.env.BIBLIOTHECA_PORT ?? 17501);
const DATA_DIR = resolve(
  process.env.BIBLIOTHECA_DATA && process.env.BIBLIOTHECA_DATA.trim()
    ? process.env.BIBLIOTHECA_DATA
    : join(__dirname, '..', 'data'),
);
const DB_PATH = join(DATA_DIR, 'bibliotheca.db');

// 認証系は必須 — 不正な値で起動して全リクエスト 401 になるより、 起動を止める
const CERNERE_BASE_URL = requireEnv('CERNERE_BASE_URL');
const AUDIENCE = requireEnv('BIBLIOTHECA_PUBLIC_URL');

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

const master = new CompositeMasterSource(
  new OpenBdSource(db),
  new LocalEquipmentSource(db),
);

const app = new Hono();
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'bibliotheca', port: PORT }),
);

// Corpus hub 用サービスマニフェスト (VantanHub-DESIGN.md D6)。 認証不要。
// Corpus がこれを読んで集約データ / UI パネルを把握する。 panel の実体は
// `public/corpus-ui/loans.js` (build:corpus-ui で生成、 serveStatic が配信)。
app.get('/.well-known/corpus-service.json', (c) =>
  c.json({
    service: 'bibliotheca',
    displayName: 'Bibliotheca',
    version: '0.1.0',
    corpusApi: 1,
    health: '/api/health',
    data: [
      { id: 'my-loans', title: '自分の貸出', path: '/api/loans/mine', scope: 'multi' },
      { id: 'open-loans', title: '貸出中一覧', path: '/api/loans/open', scope: 'multi' },
    ],
    panels: [{ id: 'loans', title: '貸出', icon: '📚', entry: 'loans.js' }],
    auth: 'cernere-project-token',
    cernereProjectKey: 'bibliotheca',
  }),
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
  console.log(`[bibliotheca] cernere: ${CERNERE_BASE_URL}`);
  console.log(`[bibliotheca] audience: ${AUDIENCE}`);
  console.log(`[bibliotheca] admin user ids: ${ADMIN_IDS.size}`);
});
