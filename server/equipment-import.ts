import { createHash, createPublicKey, verify } from 'node:crypto';
import type Database from 'better-sqlite3';
import { parseEquipmentItems, type EquipmentImportPayload } from './equipment-import-contract.ts';

/** @implements SPEC-BB-EXECUTIVE-IMPORT-001 */
export function importEquipment(db: Database.Database, envelope: unknown, publicKey: string,
  now: number): { count: number; replay: boolean } {
  if (!envelope || typeof envelope !== 'object' || !('payload' in envelope)
    || !('signature' in envelope) || typeof envelope.payload !== 'string'
    || typeof envelope.signature !== 'string' || envelope.payload.length > 2_000_000) {
    throw new Error('Signed equipment bundle required');
  }
  const bytes = Buffer.from(envelope.payload, 'base64');
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519'
    || !verify(null, bytes, key, Buffer.from(envelope.signature, 'base64'))) throw new Error('Invalid signature');
  const payload = JSON.parse(bytes.toString('utf8')) as EquipmentImportPayload;
  if (payload.service !== 'bibliotheca' || payload.version !== 1
    || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)
    || payload.issuedAt > now || payload.expiresAt <= now || payload.expiresAt - payload.issuedAt > 86400
    || !/^discord:\d+:\d+:\d+$/.test(payload.source) || payload.source.split(':')[1] !== payload.actorId
    || !/^[a-f0-9]{64}$/.test(payload.instructionHash)) throw new Error('Invalid or expired authorization');
  const items = parseEquipmentItems(payload.items);
  const digest = createHash('sha256').update(bytes).digest('hex');
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM equipment_import_batch WHERE digest = ?').get(digest)) {
      return { count: items.length, replay: true };
    }
    const insert = db.prepare(`INSERT INTO equipment
      (qr_code, name, spec, added_at, added_by_user_id) VALUES (?, ?, ?, ?, ?)`);
    const timestamp = new Date(now * 1000).toISOString();
    for (const item of items) {
      insert.run(item.qr_code, item.name, item.spec, timestamp, 'service:cc-equipment-import');
    }
    db.prepare(`INSERT INTO equipment_import_batch
      (digest, source, actor_id, instruction_hash, imported_at) VALUES (?, ?, ?, ?, ?)`)
      .run(digest, payload.source, payload.actorId, payload.instructionHash, timestamp);
    return { count: items.length, replay: false };
  })();
}
