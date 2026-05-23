// Bibliotheca 永続層 — better-sqlite3。
//
// 持つのは **貸出台帳** と **機材ローカルマスタ** のみ。
// 書籍マスタは外部 (OpenBD / 後日差し替え) なので Bibliotheca には書かない。
// 書誌キャッシュだけは `item_meta_cache` に保持して照会レイテンシを抑える。

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type ItemSource = 'book' | 'equipment';

export interface LoanRow {
  id: number;
  source: ItemSource;
  external_key: string;
  borrower_user_id: string;
  borrower_display_name: string | null;
  borrowed_at: string;
  due_at: string | null;
  returned_at: string | null;
  returned_by_user_id: string | null;
  note: string | null;
}

export interface EquipmentRow {
  qr_code: string;
  name: string;
  spec: string | null;
  added_at: string;
  added_by_user_id: string;
}

export interface MetaCacheRow {
  source: ItemSource;
  external_key: string;
  label: string;
  detail_json: string;
  fetched_at: string;
}

export function openDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS loan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK(source IN ('book', 'equipment')),
      external_key TEXT NOT NULL,
      borrower_user_id TEXT NOT NULL,
      borrower_display_name TEXT,
      borrowed_at TEXT NOT NULL,
      due_at TEXT,
      returned_at TEXT,
      returned_by_user_id TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_loan_open
      ON loan(source, external_key)
      WHERE returned_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_loan_borrower
      ON loan(borrower_user_id, returned_at);

    CREATE TABLE IF NOT EXISTS equipment (
      qr_code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      spec TEXT,
      added_at TEXT NOT NULL,
      added_by_user_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS item_meta_cache (
      source TEXT NOT NULL,
      external_key TEXT NOT NULL,
      label TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (source, external_key)
    );

    -- 返却ランデブー: ゲストが発行する短命 token を保管。
    -- admin がスキャンした QR の正当性検証と単回消費に使う。
    CREATE TABLE IF NOT EXISTS return_token (
      token        TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      display_name TEXT,
      issued_at    TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      consumed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_return_token_user
      ON return_token(user_id, expires_at);
  `);
  return db;
}

// ── Return tokens (rendezvous) ─────────────────────────────────────────────

export interface ReturnTokenRow {
  token: string;
  user_id: string;
  display_name: string | null;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export function issueReturnToken(
  db: Database.Database,
  args: { token: string; userId: string; displayName: string | null; ttlSeconds: number },
): ReturnTokenRow {
  const now = new Date();
  const expires = new Date(now.getTime() + args.ttlSeconds * 1000);
  db.prepare(
    `INSERT INTO return_token(token, user_id, display_name, issued_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).run(args.token, args.userId, args.displayName, now.toISOString(), expires.toISOString());
  return db
    .prepare<[string], ReturnTokenRow>(`SELECT * FROM return_token WHERE token = ?`)
    .get(args.token) as ReturnTokenRow;
}

/** 有効 (未期限切れ + 未消費) なトークンを返す。 そうでなければ null。 */
export function findValidReturnToken(
  db: Database.Database,
  token: string,
): ReturnTokenRow | null {
  const row = db
    .prepare<[string], ReturnTokenRow>(`SELECT * FROM return_token WHERE token = ?`)
    .get(token);
  if (!row) return null;
  if (row.consumed_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export function consumeReturnToken(db: Database.Database, token: string): boolean {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE return_token SET consumed_at = ?
         WHERE token = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .run(now, token, now);
  return info.changes > 0;
}

/** 期限切れ token を掃除する (cron 不要、 起動時に 1 回 + endpoint 突入時に 1 回呼ぶ)。 */
export function pruneExpiredReturnTokens(db: Database.Database): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(`DELETE FROM return_token WHERE expires_at < ? AND (consumed_at IS NULL OR consumed_at < ?)`)
    .run(now, now);
  return info.changes;
}

// ── Loan operations ────────────────────────────────────────────────────────

export function findOpenLoan(
  db: Database.Database,
  source: ItemSource,
  externalKey: string,
): LoanRow | null {
  const row = db
    .prepare<[ItemSource, string], LoanRow>(
      `SELECT * FROM loan
       WHERE source = ? AND external_key = ? AND returned_at IS NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(source, externalKey);
  return row ?? null;
}

export function createLoan(
  db: Database.Database,
  args: {
    source: ItemSource;
    externalKey: string;
    borrowerUserId: string;
    borrowerDisplayName: string | null;
    dueAt: string | null;
    note: string | null;
  },
): LoanRow {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO loan
         (source, external_key, borrower_user_id, borrower_display_name,
          borrowed_at, due_at, returned_at, returned_by_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    )
    .run(
      args.source,
      args.externalKey,
      args.borrowerUserId,
      args.borrowerDisplayName,
      now,
      args.dueAt,
      args.note,
    );
  return db
    .prepare<[number], LoanRow>(`SELECT * FROM loan WHERE id = ?`)
    .get(info.lastInsertRowid as number) as LoanRow;
}

export function markReturned(
  db: Database.Database,
  loanId: number,
  adminUserId: string,
): LoanRow | null {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE loan
         SET returned_at = ?, returned_by_user_id = ?
         WHERE id = ? AND returned_at IS NULL`,
    )
    .run(now, adminUserId, loanId);
  if (info.changes === 0) return null;
  return db
    .prepare<[number], LoanRow>(`SELECT * FROM loan WHERE id = ?`)
    .get(loanId) ?? null;
}

export function listOpenLoans(db: Database.Database): LoanRow[] {
  return db
    .prepare<[], LoanRow>(
      `SELECT * FROM loan WHERE returned_at IS NULL ORDER BY borrowed_at DESC`,
    )
    .all();
}

export function listLoansForUser(
  db: Database.Database,
  userId: string,
  includeReturned: boolean,
): LoanRow[] {
  if (includeReturned) {
    return db
      .prepare<[string], LoanRow>(
        `SELECT * FROM loan WHERE borrower_user_id = ? ORDER BY borrowed_at DESC LIMIT 200`,
      )
      .all(userId);
  }
  return db
    .prepare<[string], LoanRow>(
      `SELECT * FROM loan
         WHERE borrower_user_id = ? AND returned_at IS NULL
         ORDER BY borrowed_at DESC`,
    )
    .all(userId);
}

// ── Equipment master (local) ───────────────────────────────────────────────

export function upsertEquipment(
  db: Database.Database,
  args: {
    qrCode: string;
    name: string;
    spec: string | null;
    addedByUserId: string;
  },
): EquipmentRow {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO equipment(qr_code, name, spec, added_at, added_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(qr_code) DO UPDATE SET
       name = excluded.name,
       spec = excluded.spec`,
  ).run(args.qrCode, args.name, args.spec, now, args.addedByUserId);
  return db
    .prepare<[string], EquipmentRow>(`SELECT * FROM equipment WHERE qr_code = ?`)
    .get(args.qrCode) as EquipmentRow;
}

export function getEquipment(
  db: Database.Database,
  qrCode: string,
): EquipmentRow | null {
  return (
    db
      .prepare<[string], EquipmentRow>(`SELECT * FROM equipment WHERE qr_code = ?`)
      .get(qrCode) ?? null
  );
}

export function listEquipment(db: Database.Database): EquipmentRow[] {
  return db
    .prepare<[], EquipmentRow>(`SELECT * FROM equipment ORDER BY added_at DESC`)
    .all();
}

// ── Meta cache (書誌 / 機材詳細の lookup キャッシュ) ───────────────────────

export function getMetaCache(
  db: Database.Database,
  source: ItemSource,
  externalKey: string,
): MetaCacheRow | null {
  return (
    db
      .prepare<[ItemSource, string], MetaCacheRow>(
        `SELECT * FROM item_meta_cache WHERE source = ? AND external_key = ?`,
      )
      .get(source, externalKey) ?? null
  );
}

export function putMetaCache(
  db: Database.Database,
  args: {
    source: ItemSource;
    externalKey: string;
    label: string;
    detailJson: string;
  },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO item_meta_cache(source, external_key, label, detail_json, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source, external_key) DO UPDATE SET
       label = excluded.label,
       detail_json = excluded.detail_json,
       fetched_at = excluded.fetched_at`,
  ).run(args.source, args.externalKey, args.label, args.detailJson, now);
}
