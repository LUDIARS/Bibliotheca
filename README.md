# Bibliotheca

LUDIARS の本 / 機材 貸出台帳。 Cernere SSO + カメラスキャン (ISBN / QR)。

短縮コード: **Bb**

## 機能

- **本**: カメラで ISBN-13 バーコードを読取り、 OpenBD から書誌を取得
- **機材**: カメラで QR コードを読取り、 ローカルマスタから機材情報を取得
- **貸出**: 本人が自分の名前で実施
- **返却**: **管理者のみ** が物理確認のうえ実施
- **一覧**: 貸出中一覧 / 自分の貸出履歴
- **個人データ**: Cernere 単一情報源、 Bibliotheca には userId のみ保持

## 構成

- 単一 Hono アプリ (`server/`) が REST API + 静的 SPA を提供
- 永続化は SQLite (`data/bibliotheca.db`、 better-sqlite3 / WAL)
- フロントエンドは esbuild + vanilla TypeScript + ZXing
- 認証は Cernere PASETO V4 (公開鍵 fetch)

### マスタソース抽象

書籍 / 機材の中身 (タイトル / 名前 / 仕様) は **Bibliotheca が直接保持しない**。
`server/master/source.ts` の `MasterSource` interface を介して差し替え可能:

| 実装 | 役割 | 状態 |
|------|------|------|
| `OpenBdSource` | 書籍 (ISBN → 書誌) | 標準実装、 API key 不要 |
| `LocalEquipmentSource` | 機材 (QR → 名前/仕様) | 暫定。 機材マスタ DB ができたら差替 |

機材マスタ DB が外部に立ったら、 新しい `MasterSource` 実装を 1 本書いて
`server/index.ts` の `CompositeMasterSource` に差し替える。

## 起動

3 種類の env 供給モードに対応。 起動時に env-bootstrap が順次拾う。

### Mode A: ローカル .env (一番手軽)

```bash
cp .env.example .env
# .env を編集: BIBLIOTHECA_ADMIN_IDS にユーザ ID を列挙
npm install
npm run dev
```

### Mode B: Infisical (env-cli 経由) — 推奨

machine identity (`INFISICAL_*`) を `.env.secrets` に保存し、 アプリ値は
Infisical 側に置く。 Memoria / Cernere / Actio / Nuntius と同パターン。

```bash
npm install
npm run env:setup       # Infisical machine identity を対話入力 → .env.secrets
npm run env:test        # Infisical 接続確認
npm run env:list        # 登録済 secret 一覧
npm run env:set BIBLIOTHECA_ADMIN_IDS user_abc,user_def
npm run dev             # bootstrap.ts が起動時に Infisical から fetch + inject
```

### Mode C: Excubitor 経由 (本番運用)

Excubitor が parent → child process に `INFISICAL_*` を直接 inject。
リポに `.env*` を置く必要なし。 catalog.yaml で
`infisical.inject: true` を立てるだけ。

### 起動シーケンス

`npm run dev` は `tsx watch --env-file-if-exists=.env.secrets
--env-file-if-exists=.env server/bootstrap.ts` を呼ぶ。 bootstrap が:

1. `.env.secrets` (INFISICAL_*) と `.env` (アプリ env のローカルフォールバック) を読む
2. `ensureEnv()` が Infisical から secret を fetch + inject (既存値は上書きしない)
3. `index.ts` を import して本体起動

Infisical 到達不可・creds 未設定でも throw せず、 `.env` / host env のみで
graceful degrade する。

デフォルト `http://localhost:17501` (loopback)。

## ポート

`17501` — LUDIARS port-map の loopback サービスレンジ (17000–17999)。
`infra/PORT-MAP.md` への登録は別 PR。

> 注: 当初 17500 を選んだが Windows では Dropbox LAN sync が `0.0.0.0:17500`
> を常に squat するため、 1 つずらして 17501 を採用した。

## ライセンス

リポジトリの LICENSE に準ずる。
