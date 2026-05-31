# 貸出

## 目的
本 / 機材を **本人が自分名義で** 借りる。誰が何を借りているかを台帳に記録する。

## 振る舞い
- 借主はスキャン（ISBN / 機材 QR）でアイテムを特定し、`POST /api/loans` で貸出登録。
  `source`（`book`/`equipment`）+ `external_key` + 自分の `borrower_user_id` +
  `borrowed_at` を記録（任意で `due_at` / `note`）。
- 同一アイテムが既に貸出中（`returned_at IS NULL`）なら二重貸出を防ぐ
  （`idx_loan_open`）。
- 借主名は表示用に `borrower_display_name` をキャッシュ（権威は Cernere）。

## 制約・前提
- 認証必須（[`../interface/auth.md`](../interface/auth.md)）。貸出は本人のみ
  （他人名義での貸出は不可）。
- アイテムメタは [`item-lookup.md`](item-lookup.md) 経由で解決。

## 関連
API: `POST /api/loans`（[`../interface/rest-api.md`](../interface/rest-api.md)）。
データ: [`../data/schema.md`](../data/schema.md) `loan`。
