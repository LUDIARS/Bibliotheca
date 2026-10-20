import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('site transfer preserves inventory, clears return grants and refuses overwrite or bad hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb-transfer-test-'));
  const source = join(root, 'source');
  const target = join(root, 'target');
  const bundle = join(root, 'data.bundle');
  await mkdir(source);
  const db = new Database(join(source, 'bibliotheca.db'));
  db.exec(`CREATE TABLE loan (id INTEGER);
    CREATE TABLE equipment (qr_code TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE item_meta_cache (label TEXT);
    CREATE TABLE return_token (token TEXT);
    INSERT INTO equipment VALUES ('BB-TEST', 'Camera');
    INSERT INTO return_token VALUES ('expired-at-transfer');`);
  db.close();
  const run = (script: string, data: string, args: string[]) => spawnSync(process.execPath,
    [join('scripts', 'site', script), ...args], {
      encoding: 'utf8', env: { ...process.env, BIBLIOTHECA_DATA: data },
    });
  try {
    const exported = run('export-data.mjs', source, ['--output', bundle]);
    assert.equal(exported.status, 0, exported.stderr);
    const hash = createHash('sha256').update(await readFile(bundle)).digest('hex');
    assert.notEqual(run('import-data.mjs', target, ['--input', bundle, '--sha256', '0'.repeat(64)]).status, 0);
    const imported = run('import-data.mjs', target, ['--input', bundle, '--sha256', hash]);
    assert.equal(imported.status, 0, imported.stderr);
    const restored = new Database(join(target, 'bibliotheca.db'), { readonly: true });
    try {
      assert.deepEqual(restored.prepare('SELECT name FROM equipment').all(), [{ name: 'Camera' }]);
      assert.equal(restored.prepare('SELECT count(*) AS n FROM return_token').get()?.n, 0);
    } finally { restored.close(); }
    assert.notEqual(run('import-data.mjs', target, ['--input', bundle, '--sha256', hash]).status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
