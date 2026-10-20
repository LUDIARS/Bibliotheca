/** @implements SPEC-BB-AWS-001 */
import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from './data-path.mjs';

const { values } = parseArgs({ options: { output: { type: 'string' } } });
if (!values.output || !isAbsolute(values.output)) throw new Error('Absolute --output required');
const temporary = await mkdtemp(join(tmpdir(), 'bibliotheca-export-'));
let db;
try {
  db = new Database(join(dataDir, 'bibliotheca.db'), { readonly: true, fileMustExist: true });
  const backup = join(temporary, 'snapshot.db');
  await db.backup(backup);
  const bytes = await readFile(backup);
  await writeFile(values.output, JSON.stringify({
    service: 'bibliotheca', version: 1, sqlite: bytes.toString('base64'),
  }), { flag: 'wx', mode: 0o600, encoding: 'utf8' });
} finally {
  db?.close();
  await rm(temporary, { recursive: true, force: true });
}
