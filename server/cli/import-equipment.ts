import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { importEquipment } from '../equipment-import.ts';
import { migrateEquipmentImport } from '../migrations/equipment-import.ts';
import { requireEnv } from '../lib/required-env.ts';
const { values } = parseArgs({ options: { input: { type: 'string' } } });
if (!values.input || (await stat(values.input)).size > 3_000_000) throw new Error('Valid input file required');
const data = requireEnv('BIBLIOTHECA_DATA');
if (!isAbsolute(data)) throw new Error('Absolute primary service data directory required');
const publicKey = requireEnv('BIBLIOTHECA_IMPORT_PUBLIC_KEY');
const db = new Database(join(data, 'bibliotheca.db'), { fileMustExist: true });
try {
  migrateEquipmentImport(db);
  const result = importEquipment(db, JSON.parse(await readFile(values.input, 'utf8')), publicKey,
    Math.floor(Date.now() / 1000));
  process.stdout.write(JSON.stringify(result) + '\n');
} finally { db.close(); }
