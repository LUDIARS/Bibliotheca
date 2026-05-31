# アイテム検索 / スキャン

## 目的
ISBN（書籍）/ QR（機材）からアイテムのラベル・詳細を解決し、貸出・一覧表示に
使う。外部マスタは権威、Bibliotheca はキャッシュのみ持つ。

## 振る舞い
- `GET /api/items/lookup` — `source` + `external_key`（ISBN / 機材 QR）から
  メタを解決。
  - **書籍**: `MasterSource`（OpenBD）から取得。結果を `item_meta_cache` に保存。
  - **機材**: 自前の `equipment` マスタを参照。
- フロントは ZXing でバーコード / QR をスキャンして `external_key` を得る。

## マスタソース抽象
`server/master/` の `BookSource`（OpenBD）+ `EquipmentSource`（Local）を
`CompositeMasterSource` で合成。新マスタは `MasterSource` を実装して composite に
追加する（差し替え可能・本メタの自前保持はしない方針）。

## 制約・前提
- 認証必須。`item_meta_cache` は権威ではなくキャッシュ（`fetched_at` で鮮度管理）。

## 関連
API: `GET /api/items/lookup`。データ: [`../data/schema.md`](../data/schema.md)
`item_meta_cache` / `equipment`。
