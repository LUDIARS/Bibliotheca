import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { signEquipmentImport } from '../server/equipment-import-signer.ts';
import { importEquipment } from '../server/equipment-import.ts';
import { openDb } from '../server/db.ts';
const pair = generateKeyPairSync('ed25519');
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const item = { qr_code: 'BB-CAMERA', name: 'Camera', spec: null };
function evidence(role = 'executive', source = 'discord:123:456:789', author = 'user'): typeof fetch {
  return (async (url: URL | RequestInfo) => Response.json(String(url).includes('/messages?')
    ? { messages: [{ id: 42, author_type: author, content: 'Add camera',
      metadata: { inject_source: source, inject_is_cc: false } }] }
    : { members: [{ platform_user_id: '123', role }] })) as typeof fetch;
}
const input = { items: [item], session: 'example-session', messageId: 42,
  ccUrl: 'http://127.0.0.1:11111', privateKey, now: 1000 };
test('signer rejects non-executives, system messages and unverified source formats', async () => {
  for (const read of [evidence('manager'), evidence('executive', 'discord:456/789'),
    evidence('executive', 'discord:123:456:789', 'system')]) {
    await assert.rejects(signEquipmentImport(input, read));
  }
});
test('signature, expiry, replay and transactional conflicts protect inventory', async () => {
  const bundle = await signEquipmentImport(input, evidence());
  const db = openDb(':memory:');
  try {
    assert.deepEqual(importEquipment(db, bundle, publicKey, 1001), { count: 1, replay: false });
    assert.deepEqual(importEquipment(db, bundle, publicKey, 1002), { count: 1, replay: true });
    assert.throws(() => importEquipment(db, { ...bundle, signature: 'AA==' }, publicKey, 1002));
    assert.throws(() => importEquipment(db, bundle, publicKey, 90000));
    const conflicting = await signEquipmentImport({ ...input, items: [
      { ...item, qr_code: 'BB-NEW' }, item,
    ] }, evidence());
    assert.throws(() => importEquipment(db, conflicting, publicKey, 1002));
    assert.equal(db.prepare('SELECT count(*) AS n FROM equipment').get()?.n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM equipment_import_batch').get()?.n, 1);
  } finally { db.close(); }
});
