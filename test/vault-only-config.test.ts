import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('launch scripts use injected env and preserve the frontend prestart build', () => {
  const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.equal(scripts.dev, 'tsx watch server/bootstrap.ts');
  assert.equal(scripts.start, 'tsx server/bootstrap.ts');
  assert.equal(scripts['start:excubitor'], 'npm run start');
  assert.equal(scripts.prestart, 'npm run build:web');
  assert.ok(Object.keys(scripts).every((name) => !name.startsWith('env:')));
  assert.doesNotMatch(Object.values(scripts).join('\n'), /--env-file|dotenv|env:gen/);
});

test('startup validates injected settings before loading the application', () => {
  const bootstrap = read('server/bootstrap.ts');
  for (const name of ['CERNERE_BASE_URL', 'BIBLIOTHECA_PUBLIC_URL']) {
    const validation = bootstrap.indexOf(`requireEnv('${name}')`);
    assert.ok(validation >= 0 && validation < bootstrap.indexOf("import('./index.ts')"));
  }
  assert.doesNotMatch(bootstrap, /ensureEnv|Infisical|env-bootstrap|fetch\(/i);
  for (const path of ['server/lib/env-bootstrap.ts', 'env-cli.config.ts', '.env.example']) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false);
  }
});

test('catalog delegates credentials and endpoint discovery to Excubitor', () => {
  const catalog = read('excubitor.catalog.yaml');
  assert.match(catalog, /command: node --run start:excubitor/);
  assert.match(catalog, /port: 17501/);
  assert.match(catalog, /autostart: false/);
  assert.match(catalog, /depends_on: \[cernere\]/);
  assert.match(catalog, /required_env: \[CERNERE_BASE_URL, BIBLIOTHECA_PUBLIC_URL\]/);
  assert.match(catalog, /target_project: bibliotheca/);
  assert.match(catalog, /keys: \[EXCUBITOR_CERNERE_CLIENT_ID, EXCUBITOR_CERNERE_CLIENT_SECRET\]/);
  assert.doesNotMatch(catalog, /vtn-game\.com|CERNERE_BASE_URL:|BIBLIOTHECA_PUBLIC_URL:|BIBLIOTHECA_ADMIN_IDS:/);
});
