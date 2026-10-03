# Bibliotheca

LUDIARS の本 / 機材 貸出台帳。 Cernere SSO + カメラスキャン (ISBN / QR)。

短縮コード: **Bb**

## 機能

- **本**: カメラで ISBN-13 バーコードを読取り、 OpenBD から書誌を取得
- **機材**: カメラで QR コードを読取り、 ローカルマスタから機材情報を取得
- **貸出**: 本人が自分の名前で実施
- **返却**: **管理者のみ** が物理確認のうえ実施
- **一覧**: 貸出中一覧 / 自分の貸出履歴
- **個人データ**: Cernere 単一情報源、 Bibliotheca には userId と表示名キャッシュのみ保持

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

Excubitor のサービス bibliotheca から起動する。定義の正本は
[excubitor.catalog.yaml](excubitor.catalog.yaml)。依存関係導入時は
Vestigium submodule を初期化し、npm install を行う。

設定と secret は Excubitor が注入する。優先順位は topology < catalog env < 暗号化 runtime config < Vault。
CERNERE_BASE_URL は Cernere の topology から供給する。BIBLIOTHECA_PUBLIC_URL は
実際の公開 URL を runtime config 等に設定する。現行値は未確認のため既定値を置かない。
アプリによる Infisical 取得やローカル env ファイル読込みは行わない。
Cernere の資格情報は Excubitor が起動ごとに発行する。project 登録状況は別途確認が必要。

node --run start:excubitor は npm run start を呼び、prestart で frontend をビルドしてから
bootstrap を実行する。監視対象の root process は Node。
必須設定の不足・空白値は変数名だけを示して停止する。dev も環境変数注入済みを前提とする。

詳しくは [セットアップ](spec/setup/setup.md)、[テスト設計](spec/test/test-design.md) を参照。

## ポート

catalog に 17501 を宣言する。2026-10-04 の Excubitor ports API で
17501 の待受と既存 catalog 割当がないことを確認した。自動起動は無効。

## ライセンス

リポジトリの LICENSE に準ずる。
