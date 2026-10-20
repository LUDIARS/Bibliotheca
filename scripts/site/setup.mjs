/** @implements SPEC-BB-AWS-001 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runNpm } from './npm.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
for (const name of ['CERNERE_BASE_URL', 'BIBLIOTHECA_PUBLIC_URL']) {
  if (!process.env[name]?.trim()) throw new Error(`Missing required environment variable: ${name}`);
}
await runNpm(join(root, 'lib/vestigium'), ['ci', '--include=dev', '--no-audit', '--no-fund']);
await runNpm(root, ['ci', '--include=dev', '--no-audit', '--no-fund']);
await runNpm(root, ['run', 'build:web']);
