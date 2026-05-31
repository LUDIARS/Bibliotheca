# 書籍の一括取込

## 目的
所蔵書籍のメタを ISBN 群からまとめて取り込み、`item_meta_cache` を温める
（貸出時の都度 fetch を減らし、一覧表示を速くする）。

## 振る舞い
- `POST /api/items/books/bulk`（admin） — ISBN のリストを受け取り、`MasterSource`
  （OpenBD）からメタを取得して `item_meta_cache` に一括保存。

## 制約・前提
- admin のみ（`requireAdmin`）。書籍メタの権威は外部マスタ。Bibliotheca は
  キャッシュとして持つだけ（`fetched_at` で鮮度管理）。
- 機材は外部マスタが無いため対象外（[`equipment-master.md`](equipment-master.md)）。

## 関連
API: `POST /api/items/books/bulk`。データ: [`../data/schema.md`](../data/schema.md)
`item_meta_cache`。
