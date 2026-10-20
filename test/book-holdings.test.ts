import assert from 'node:assert/strict';
import { it } from 'node:test';
import { openDb, putMetaCache } from '../server/db.ts';
import { migrateBookHoldings } from '../server/migrations/book-holdings.ts';
import { listBookHoldings, registerBookHolding } from '../server/book-holdings.ts';

it('does not confuse cached book lookups with owned books; registration is idempotent', () => {
  const db = openDb(':memory:');
  try {
    putMetaCache(db, { source: 'book', externalKey: '9780000000002', label: 'Book',
      detailJson: '{}' });
    assert.deepEqual(listBookHoldings(db), []);
    registerBookHolding(db, '9780000000002', 'admin');
    registerBookHolding(db, '9780000000002', 'admin');
    migrateBookHoldings(db);
    const rows = listBookHoldings(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.title, 'Book');
    assert.equal(rows[0]?.on_loan, 0);
  } finally { db.close(); }
});
