/**
 * bootstrap entry — Infisical 経由で env を確定してから本体を起動する。
 *
 * npm run dev / npm start はこのファイルを `tsx --env-file-if-exists=.env.secrets
 * --env-file-if-exists=.env` で起動する。 順番:
 *
 *   1. tsx が .env.secrets (INFISICAL_*) と .env (アプリ env のローカルフォールバック)
 *      を process.env に読み込む
 *   2. ensureEnv() が Infisical から WANTED_KEYS / その他 secret を fetch + inject
 *      (既存 process.env 値は上書きしない = ローカル .env / Excubitor inject 優先)
 *   3. index.ts を import して本体起動
 *
 * Infisical 創設情報が無い・到達不可でも throw しない。 index.ts 側で
 * env 不足を検出してログに警告を出し、 .env 直書き or hardcoded fallback で進む。
 */

import { ensureEnv, missingWantedKeys, hasInfisicalCreds } from './lib/env-bootstrap.ts';
import { install as installVestigium } from '@ludiars/vestigium';

const main = async (): Promise<void> => {
  installVestigium({
    serviceCode: 'bb',
    captureConsole: true,
    pinoTransport: false,
  });
  const result = await ensureEnv();
  if (result.reason === 'no_creds') {
    if (hasInfisicalCreds()) {
      // 通常ここに来ない (creds はあるが result.ok=false)
      console.warn('[bootstrap] INFISICAL_* creds は揃っているが injection skip');
    } else {
      console.log(
        '[bootstrap] INFISICAL_* creds 未設定 — .env / host env のみで起動',
      );
    }
  }
  const missing = missingWantedKeys();
  if (missing.length > 0) {
    console.warn(
      `[bootstrap] 未設定の WANTED_KEYS: ${missing.join(', ')} — 機能が degraded`,
    );
  }
  await import('./index.ts');
};

void main();
