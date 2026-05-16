// 外部マスタソースの抽象。
//
// 書籍 / 機材の「中身」(タイトル / 著者 / 名称 / 仕様) は Bibliotheca が
// 直接持たない。 ISBN や QR を key に外部 DB へ問い合わせる。
//
// 書籍と機材は別マスタが原則 (ユーザ要件)。 そのため interface も
// `BookSource` と `EquipmentSource` に分け、 adapter は自分の領域だけ実装する。
// 呼び出し側 (routes/*) は両方欲しいので、 facade として `MasterSource` を
// `CompositeMasterSource` で組み立てて渡す。

import type Database from 'better-sqlite3';

export interface BookMeta {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  cover: string | null;
}

export interface EquipmentMeta {
  qrCode: string;
  name: string;
  spec: string | null;
}

export interface BookSource {
  lookupBook(isbn: string): Promise<BookMeta | null>;
}

export interface EquipmentSource {
  lookupEquipment(qrCode: string): Promise<EquipmentMeta | null>;
}

export interface MasterSource extends BookSource, EquipmentSource {}

export interface MasterSourceCtx {
  db: Database.Database;
}
