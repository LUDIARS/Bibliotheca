import type Database from 'better-sqlite3';

export interface BookHolding {
  isbn: string;
  title: string | null;
  added_at: string;
  on_loan: number;
}

/** An ISBN lookup cache is not evidence that the club owns a book.
 * @implements SPEC-BB-HOLDINGS-001
 */
export function listBookHoldings(db: Database.Database): BookHolding[] {
  return db.prepare<[], BookHolding>(`
    SELECT h.isbn, m.label AS title, h.added_at,
      EXISTS(SELECT 1 FROM loan l WHERE l.source = 'book'
        AND l.external_key = h.isbn AND l.returned_at IS NULL) AS on_loan
    FROM book_holding h LEFT JOIN item_meta_cache m
      ON m.source = 'book' AND m.external_key = h.isbn
    ORDER BY COALESCE(m.label, h.isbn), h.isbn
  `).all();
}

/** Register ownership explicitly; repeated imports do not duplicate it.
 * @implements SPEC-BB-HOLDINGS-001
 */
export function registerBookHolding(db: Database.Database, isbn: string, userId: string): void {
  db.prepare(`INSERT INTO book_holding (isbn, added_at, added_by_user_id)
    VALUES (?, ?, ?) ON CONFLICT (isbn) DO NOTHING`).run(isbn, new Date().toISOString(), userId);
}
