/** @implements SPEC-BB-AWS-001 */
import Database from 'better-sqlite3';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from './data-path.mjs';

const { values } = parseArgs({ options: { input: { type: 'string' }, sha256: { type: 'string' } } });
if (!values.input || !isAbsolute(values.input) || !/^[a-f0-9]{64}$/.test(values.sha256 ?? '')) {
  throw new Error('Absolute --input and lowercase --sha256 required');
}
if ((await stat(values.input)).size > 128 * 1024 * 1024) throw new Error('Bundle too large');
const bytes = await readFile(values.input);
if (createHash('sha256').update(bytes).digest('hex') !== values.sha256) throw new Error('Hash mismatch');
const bundle = JSON.parse(bytes.toString('utf8'));
if (bundle.service !== 'bibliotheca' || bundle.version !== 1 || typeof bundle.sqlite !== 'string') {
  throw new Error('Unsupported bundle');
}
const snapshot = Buffer.from(bundle.sqlite, 'base64');
if (snapshot.subarray(0, 16).toString('binary') !== 'SQLite format 3\u0000') throw new Error('Invalid SQLite data');
const temporary = await mkdtemp(join(tmpdir(), 'bibliotheca-import-'));
let db;
try {
  const backup = join(temporary, 'snapshot.db');
  await writeFile(backup, snapshot, { flag: 'wx', mode: 0o600 });
  db = new Database(backup);
  if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Invalid database');
  for (const table of ['loan', 'equipment', 'item_meta_cache', 'return_token']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`Missing table: ${table}`);
    }
  }
  // Short-lived return authorizations must not survive a site transfer.
  db.exec('DELETE FROM return_token');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.close(); db = undefined;
  await mkdir(dataDir, { recursive: true });
  await copyFile(backup, join(dataDir, 'bibliotheca.db'), constants.COPYFILE_EXCL);
} finally {
  db?.close();
  await rm(temporary, { recursive: true, force: true });
}
