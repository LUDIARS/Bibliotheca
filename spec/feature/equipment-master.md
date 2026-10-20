# 機材マスタ管理

## 目的
書籍と違い外部マスタが無い **機材** を、Ccで執行役員から受けた指示に基づくAIインポートで
自前マスタ（`equipment`）に追加する（Bibliotheca が自前保持する例外データ）。

## 振る舞い
- `GET /api/items/equipment` — 機材マスタ一覧（認証）。
- `POST /api/items/equipment` / `/bulk` — 管理者を含め403。通常のWeb登録は禁止。
- 追加は [Cc執行役員インポート](executive-equipment-import.md) に限定。既存行は上書きしない。
- 登録時に `added_at` / `added_by_user_id` を記録。

## 制約・前提
- 登録はCcの原指示・執行役員の役職確認と署名検証を必須とする。
- `qr_code` が PK。貸出時はこの QR が `loan.external_key`（source=`equipment`）になる。

## 関連
API: `/api/items/equipment*`。データ: [`../data/schema.md`](../data/schema.md) `equipment`。
