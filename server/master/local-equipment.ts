// ローカル機材マスタ adapter。 QR コードを key に SQLite の equipment テーブルを引く。
// 後日「機材マスタ DB」 が別サービスとして立てば、 同じ EquipmentSource interface で差し替える。

import type Database from 'better-sqlite3';
import { getEquipment } from '../db.ts';
import type { EquipmentMeta, EquipmentSource } from './source.ts';

export class LocalEquipmentSource implements EquipmentSource {
  constructor(private readonly db: Database.Database) {}

  async lookupEquipment(qrCode: string): Promise<EquipmentMeta | null> {
    const row = getEquipment(this.db, qrCode);
    if (!row) return null;
    return { qrCode: row.qr_code, name: row.name, spec: row.spec };
  }
}
