// OpenBD adapter — ISBN を投げると JP の書誌が返る (鍵不要)。
// https://api.openbd.jp/v1/get?isbn=...
//
// 取得結果は db.item_meta_cache にキャッシュする。 2 回目以降は API 不要。

import type Database from 'better-sqlite3';
import { getMetaCache, putMetaCache } from '../db.ts';
import type { BookMeta, BookSource } from './source.ts';

const OPENBD_ENDPOINT = 'https://api.openbd.jp/v1/get';

interface OpenBdEntry {
  summary?: {
    isbn?: string;
    title?: string;
    author?: string;
    publisher?: string;
    cover?: string;
  };
}

export class OpenBdSource implements BookSource {
  constructor(private readonly db: Database.Database) {}

  async lookupBook(isbn: string): Promise<BookMeta | null> {
    const normalized = isbn.replace(/[^\d Xx]/g, '');
    if (!normalized) return null;

    const cached = getMetaCache(this.db, 'book', normalized);
    if (cached) {
      try {
        return JSON.parse(cached.detail_json) as BookMeta;
      } catch {
        // fall through to refetch
      }
    }

    try {
      const url = `${OPENBD_ENDPOINT}?isbn=${encodeURIComponent(normalized)}`;
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<OpenBdEntry | null>;
      const entry = body?.[0];
      if (!entry || !entry.summary) return null;
      const meta: BookMeta = {
        isbn: entry.summary.isbn ?? normalized,
        title: entry.summary.title ?? '(no title)',
        author: entry.summary.author ?? null,
        publisher: entry.summary.publisher ?? null,
        cover: entry.summary.cover ?? null,
      };
      putMetaCache(this.db, {
        source: 'book',
        externalKey: normalized,
        label: meta.title,
        detailJson: JSON.stringify(meta),
      });
      return meta;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[openbd] fetch failed: ${msg}`);
      return null;
    }
  }
}
