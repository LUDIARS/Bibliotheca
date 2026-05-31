# 返却

## 目的
貸出を **admin が確定** して返却済にする。借主が立ち会えない場合の
「返却ランデブー」（短命 token）もサポート。

## 振る舞い

### A. admin 直接返却
- `POST /api/loans/:id/return`（admin）で当該 loan に `returned_at` /
  `returned_by_user_id` をセット。

### B. 返却ランデブー（token）
借主と admin が同席しない / セルフ返却ボックス的な運用のための単回 token フロー:
1. 借主が `POST /api/returns/token` で短命 `return_token` を発行（QR 表示等）。
2. admin が token をスキャンし `POST /api/returns/lookup`（admin）で正当性検証
   （未消費・未失効か）。
3. `POST /api/returns/confirm`（admin）で **token を単回消費**（`consumed_at`）し、
   対応する loan を返却済にする。

## 制約・前提
- 返却確定は admin のみ（`requireAdmin`）。token は `expires_at` で失効、
  `consumed_at` で単回。
- 個人データは保持しない（user_id + 表示名のみ）。

## 関連
API: `/api/loans/:id/return`, `/api/returns/{token,lookup,confirm}`。
データ: [`../data/schema.md`](../data/schema.md) `loan` / `return_token`。
