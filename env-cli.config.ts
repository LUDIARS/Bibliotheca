import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

/**
 * Bibliotheca の env-cli 設定。
 *
 * 用途:
 *   npm run env:setup        Infisical 初回設定 (machine identity を .env.secrets に保存)
 *   npm run env:gen          Infisical から secret を fetch して .env を生成
 *   npm run env:list         Infisical 登録 secret の一覧
 *   npm run env:set <K> <V>  Infisical に secret を登録
 *   npm run env:test         Infisical 接続テスト
 *
 * 設計ノート:
 *   - INFISICAL_* (machine identity) は env-cli setup で .env.secrets に保存。
 *     `tsx --env-file-if-exists=.env.secrets server/bootstrap.ts` がそれを読む。
 *   - アプリ secret (CERNERE_BASE_URL / BIBLIOTHECA_ADMIN_IDS 等) は Infisical 側に置く。
 *     bootstrap.ts の env-bootstrap が起動時に Infisical から fetch + inject する。
 *   - Excubitor が parent → child に INFISICAL_* を直接渡している場合は
 *     .env.secrets 不要 (process.env に既に乗っているため env-bootstrap がそのまま動く)。
 */

const config: EnvCliConfig = {
  name: "Bibliotheca",

  /**
   * 起動時のフォールバック値。 Infisical に同名キーがあればそちらを優先。
   * 空欄は「Infisical に必ず置くこと」 を示すために残す。
   */
  infraKeys: {
    // ─── Hono listen port (loopback only) ────────────────────
    // 17500 は Windows で Dropbox LAN sync が squat するので 17501 を採用。
    BIBLIOTHECA_PORT: "17501",

    // ─── データ保存ディレクトリ (SQLite + meta cache) ─────────
    // 既定: server/../data/ (= リポ直下の data/、 gitignore 済)
    BIBLIOTHECA_DATA: "",

    // ─── Cernere 認証 ────────────────────────────────────────
    // PASETO V4 公開鍵 fetch 先 + ログイン redirect 先
    CERNERE_BASE_URL: "",

    // ─── このサービス自身の public URL (PASETO audience claim) ─
    BIBLIOTHECA_PUBLIC_URL: "http://localhost:17501",

    // ─── Cernere project key (Cernere admin UI で発行) ────────
    BIBLIOTHECA_PROJECT_KEY: "bibliotheca",

    // ─── Admin user IDs (Cernere sub claim をカンマ区切り) ────
    // 返却操作はこのリストの user のみ実行可能。
    BIBLIOTHECA_ADMIN_IDS: "",
  },

  secretsPath: ".env.secrets",
  dotenvPath: ".env",

  defaultSiteUrl: "https://infisical.vtn-game.com",
  defaultEnvironment: "dev",

  required: {
    production: [
      "CERNERE_BASE_URL",
      "BIBLIOTHECA_ADMIN_IDS",
      "BIBLIOTHECA_PUBLIC_URL",
    ],
  },
};

export default config;
