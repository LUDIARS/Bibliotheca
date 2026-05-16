// 外部マスタソースの抽象。
//
// 書籍 / 機材の「中身」(タイトル / 著者 / 名称 / 仕様) は Bibliotheca が
// 直接持たない。 ISBN や QR を key に外部 DB へ問い合わせる。
// 現段階では OpenBD (書籍) と SQLite の equipment テーブル (機材) を
// 使うが、 後で社内マスタ DB に差し替える前提でこの interface に統一する。

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

export interface MasterSource {
  lookupBook(isbn: string): Promise<BookMeta | null>;
  lookupEquipment(qrCode: string): Promise<EquipmentMeta | null>;
}

export interface MasterSourceCtx {
  db: Database.Database;
}
