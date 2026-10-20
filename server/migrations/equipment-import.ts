import type Database from 'better-sqlite3';
export function migrateEquipmentImport(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS equipment_import_batch (
    digest TEXT PRIMARY KEY, source TEXT NOT NULL, actor_id TEXT NOT NULL,
    instruction_hash TEXT NOT NULL, imported_at TEXT NOT NULL
  )`);
}
