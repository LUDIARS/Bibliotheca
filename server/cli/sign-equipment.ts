import { readFile, writeFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { signEquipmentImport } from '../equipment-import-signer.ts';
import { requireEnv } from '../lib/required-env.ts';
const { values } = parseArgs({ options: {
  input: { type: 'string' }, output: { type: 'string' }, session: { type: 'string' }, message: { type: 'string' },
} });
if (!values.input || !values.output || !values.session) throw new Error('input, output and session required');
if ((await stat(values.input)).size > 1_000_000) throw new Error('Input too large');
const list: unknown = JSON.parse(await readFile(values.input, 'utf8'));
const bundle = await signEquipmentImport({
  items: list, session: values.session, messageId: Number(values.message),
  ccUrl: requireEnv('CONCORDIA_URL'), privateKey: requireEnv('BIBLIOTHECA_IMPORT_SIGNING_KEY'),
  now: Math.floor(Date.now() / 1000),
});
await writeFile(values.output, JSON.stringify(bundle), { flag: 'wx', mode: 0o600, encoding: 'utf8' });
