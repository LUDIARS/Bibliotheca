/** Excubitor supplies configuration and Vault secrets before launching this entry. */
import { install as installVestigium } from '@ludiars/vestigium';
import { requireEnv } from './lib/required-env.ts';

const main = async (): Promise<void> => {
  installVestigium({
    serviceCode: 'bb',
    captureConsole: true,
    pinoTransport: false,
  });
  // Validate before loading the database and authentication modules.
  requireEnv('CERNERE_BASE_URL');
  requireEnv('BIBLIOTHECA_PUBLIC_URL');
  requireEnv('CERNERE_PROJECT_CLIENT_ID');
  requireEnv('CERNERE_PROJECT_CLIENT_SECRET');
  await import('./index.ts');
};

void main();
