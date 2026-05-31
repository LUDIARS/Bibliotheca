# 貸出中一覧 / 自分の履歴

## 目的
「いま誰が何を借りているか」を全員が把握でき、各自は自分の貸出履歴を確認できる。

## 振る舞い
- **貸出中一覧**: `GET /api/loans/open` — 未返却（`returned_at IS NULL`）の loan 一覧。
  管理画面 + 一般ユーザの「誰が借りているか」表示に使う。
- **自分の履歴**: `GET /api/loans/mine` — 認証ユーザの貸出履歴
  （`idx_loan_borrower` で `borrower_user_id` 絞り）。

## 制約・前提
- どちらも認証必須。借主表示名はキャッシュ値（権威は Cernere）。
- アイテムのラベル / 詳細は `item_meta_cache` から解決
  （[`item-lookup.md`](item-lookup.md)）。

## 関連
API: `GET /api/loans/open`, `GET /api/loans/mine`。
データ: [`../data/schema.md`](../data/schema.md) `loan`。
