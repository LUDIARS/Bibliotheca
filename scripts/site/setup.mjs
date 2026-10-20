/** @implements SPEC-BB-AWS-001 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { runNpm } from './npm.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Bootstrap hooks receive the supervisor environment, not service Vault values.
// server/bootstrap.ts validates required service settings when Excubitor starts it.
await new Promise((resolve, reject) => {
  const child = spawn('git', ['submodule', 'update', '--init', '--recursive'], {
    cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  child.once('error', reject);
  child.once('close', code => code === 0 ? resolve() : reject(new Error('Submodule setup failed')));
});
await runNpm(join(root, 'lib/vestigium'), ['ci', '--include=dev', '--no-audit', '--no-fund']);
await runNpm(root, ['ci', '--include=dev', '--no-audit', '--no-fund']);
await runNpm(root, ['run', 'build:web']);
