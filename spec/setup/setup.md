# セットアップ

## 前提
- Node.js（Hono + better-sqlite3 + esbuild）。Cernere（認証）に到達できること。
- admin を使うなら `BIBLIOTHECA_ADMIN_IDS` に Cernere user id を列挙。

## 起動（env 供給 3 モード）
起動時に env-bootstrap（[`../../server/lib/env-bootstrap.ts`](../../server/lib/env-bootstrap.ts)）が
順に env を拾う。

### Mode A: ローカル `.env`（最も手軽）
```sh
cp .env.example .env   # BIBLIOTHECA_ADMIN_IDS 等を編集
npm run dev
```

### Mode B: Infisical（env-cli 経由・推奨）
Memoria / Cernere / Actio / Nuntius と同パターン。
```sh
npm run env:setup                                   # machine identity 入力 → .env.secrets
npm run env:test                                    # 接続確認
npm run env:set BIBLIOTHECA_ADMIN_IDS user_a,user_b
npm run dev                                         # 起動時に Infisical から fetch+inject
```

### Mode C: Excubitor 経由（本番運用）
- 監視サービス側から env を供給。

> Infisical 到達不可・creds 未設定でも throw せず、`.env` / host env のみで起動する
> （fail-soft）。`ensureEnv()` は既存値を上書きしない。

## ポート
- 既定 `http://localhost:17501`（loopback）。LUDIARS port-map の 17000–17999 帯。
  17500 は Dropbox LAN sync が squat するため 1 つずらして 17501。

## 主要 env
| 変数 | 用途 |
|---|---|
| `BIBLIOTHECA_ADMIN_IDS` | admin 操作を許す Cernere user id（カンマ区切り） |
| Cernere 接続系 | 公開鍵 fetch 先 / SSO 設定（env-cli / Infisical 管理） |
| DB パス | SQLite ファイルの場所（既定 `data/`） |
