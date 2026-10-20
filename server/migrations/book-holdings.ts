import type Database from 'better-sqlite3';

/** @implements SPEC-BB-HOLDINGS-001 */
export function migrateBookHoldings(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_holding (
      isbn TEXT PRIMARY KEY,
      added_at TEXT NOT NULL,
      added_by_user_id TEXT NOT NULL
    )
  `);
}
