# 機材マスタ管理

## 目的
書籍と違い外部マスタが無い **機材** を、admin が自前マスタ（`equipment`）に登録・
管理する（Bibliotheca が自前保持する例外データ）。

## 振る舞い
- `GET /api/items/equipment` — 機材マスタ一覧（認証）。
- `POST /api/items/equipment`（admin） — 機材 1 件を登録（`qr_code` PK + name + spec）。
- `POST /api/items/equipment/bulk`（admin） — 機材を一括 upsert。
- 登録時に `added_at` / `added_by_user_id` を記録。

## 制約・前提
- 登録 / 一括は admin のみ（`requireAdmin`、[`../interface/auth.md`](../interface/auth.md)）。
- `qr_code` が PK。貸出時はこの QR が `loan.external_key`（source=`equipment`）になる。

## 関連
API: `/api/items/equipment*`。データ: [`../data/schema.md`](../data/schema.md) `equipment`。
