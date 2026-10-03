# セットアップ

## 前提

Node.js（`node --run` 対応）、初期化済み Vestigium submodule、npm 依存関係、
Excubitor / Vault と稼働中の Cernere が必要。

## 起動と設定

サービス定義は [`../../excubitor.catalog.yaml`](../../excubitor.catalog.yaml)。
Excubitor から `bibliotheca` を起動する。自動起動は無効。
`node --run start:excubitor` → `npm run start` の prestart で frontend をビルドし、本体を起動する。

環境変数の優先順位は topology < catalog env < 暗号化 runtime config < Vault。
アプリは注入済み値だけを使い、Infisical 接続やローカル env ファイル読込みはしない。
必須値が未設定・空白なら DB 初期化や待受より前に停止し、エラーには変数名だけを示す。

| 変数 | 供給元・用途 |
|---|---|
| `CERNERE_BASE_URL` | 必須。Cernere の provides から topology で注入 |
| `BIBLIOTHECA_PUBLIC_URL` | 必須。認証 audience。現行公開 URL を runtime config 等に設定。現在未確認 |
| `BIBLIOTHECA_PORT` | catalog env: 17501 |
| `BIBLIOTHECA_PROJECT_KEY` | catalog env: bibliotheca（非 secret） |
| `BIBLIOTHECA_DATA` | 任意。既定はリポの data ディレクトリ |
| `BIBLIOTHECA_ADMIN_IDS` | 任意。管理者 user id のカンマ区切り。Vault 等から注入し、公開 catalog には書かない。未設定なら管理者なし |

Cernere の issuer secret は `requires_secret` で Vault binding を参照し、
`cernere_launch_credentials.target_project: bibliotheca` により起動単位の資格情報を発行する。
固定の client secret は保持しない。Cernere project の登録状況は未確認であり、この変更では登録しない。

17501 は 2026-10-04 に Excubitor ports API で待受・既存 catalog 割当なしを確認した。
旧公開ドメインは再利用しない。既存のローカル env ファイルの移行確認・削除は親セッションが行う。
