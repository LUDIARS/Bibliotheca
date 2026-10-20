import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const dataDir = resolve(process.env.BIBLIOTHECA_DATA?.trim()
  || fileURLToPath(new URL('../../data', import.meta.url)));
