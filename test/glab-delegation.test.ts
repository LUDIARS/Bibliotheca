import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { openDb, createLoan, upsertEquipment } from '../server/db.ts';
import { GLAB_PREFIX, makeGlabRouter } from '../server/glab-delegation.ts';
import { CompositeDelegations, type DelegatedHttpOperation } from '../vendor/cernere-composite/source/delegation.js';
import type { BoundServiceSession } from '../vendor/cernere-composite/source/service-session.js';
import type { MasterSource } from '../server/master/source.ts';

const token = 'a'.repeat(43);
const user = { id: 'borrower', role: 'general', displayName: 'Borrower', email: null };

test('vendored SDK and license retain the exact accepted upstream bytes', () => {
  const root = new URL('../vendor/cernere-composite/', import.meta.url);
  const pin = JSON.parse(readFileSync(new URL('source-pin.json', root), 'utf8')) as { revision: string; hashes: Record<string, string> };
  assert.equal(pin.revision, '71d6c368dc188bbb95f9af323d347060425d99d6');
  assert.deepEqual(Object.keys(pin.hashes).sort(), ['LICENSE', 'captured-operation.ts', 'composite.ts', 'delegation.ts',
    'service-identity.ts', 'service-session.ts', 'types.ts', 'upload-body.ts', 'upload.ts']);
  for (const [file, expected] of Object.entries(pin.hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`source/${file}`, root))).digest('hex'), expected, file);
  }
});

function fixture() {
  const db = openDb(':memory:');
  const master: MasterSource = {
    async lookupBook() { return null; },
    async lookupEquipment(key) { return { qrCode: key, name: 'Equipment', spec: null }; },
  };
  const pending = new Map<string, Record<string, unknown>>();
  let sequence = 0;
  let unavailable = false;
  let sourceProject = 'glab';
  let targetProject = 'bibliotheca';
  let consumes = 0;
  // Only the remote authority is a fixture. Both endpoints use the real SDK's
  // envelope construction, exact-byte validation and destination checks.
  const issuer = new CompositeDelegations(async (_action, value) => {
    const body = value as Record<string, unknown>;
    pending.set(body.requestId as string, body);
    return { delegationToken: token, requestId: body.requestId, expiresAt: new Date(Date.now() + 20_000).toISOString() };
  }, 'glab');
  const consumer = new CompositeDelegations(async (action, value) => {
    consumes++;
    assert.equal(action, 'consume-delegation');
    if (unavailable) throw new Error('Unavailable');
    const body = value as Record<string, unknown>;
    const issued = pending.get(body.requestId as string);
    pending.delete(body.requestId as string); // Atomic, irreversible consumption.
    assert.ok(issued, 'missing or reused authority capability');
    for (const field of ['action', 'method', 'path', 'resource', 'requestId', 'headersDigest', 'contentDigest']) {
      assert.equal(body[field], issued[field], `bound ${field}`);
    }
    return { allowed: true, requestId: body.requestId, sourceProject, projectKey: targetProject, user,
      risk: body.method === 'POST' ? 'important' : ['equipment.list', 'items.lookup', 'inventory.books.list'].includes(body.action as string) ? 'read' : 'sensitive_read',
      expiresAt: new Date(Date.now() + 20_000).toISOString() };
  }, 'bibliotheca');
  const app = new Hono();
  const admins = new Set<string>();
  app.route(GLAB_PREFIX, makeGlabRouter(db, master, consumer, admins));
  const session: BoundServiceSession = { projectKey: 'glab', user, projectToken: 'source-only',
    sessionBinding: 'source-binding', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  async function prepare(path: string, action: string, method: 'GET' | 'POST' = 'GET', body = '', modify?: (init: RequestInit) => void): Promise<RequestInit> {
    const headers = new Headers(body ? { 'content-type': 'application/json' } : {});
    const requestId = `request-${++sequence}`;
    const operation: DelegatedHttpOperation = { method, action, path, resource: path, body, headers, requestId };
    await issuer.issue(session, { projectKey: 'bibliotheca', audience: 'https://bb.example.test' }, operation);
    headers.set('authorization', `Cernere-Delegation ${token}`);
    headers.set('x-cernere-request-id', requestId);
    const init: RequestInit = { method, headers, ...(body ? { body } : {}) };
    modify?.(init);
    return init;
  }
  async function request(path: string, action: string, method: 'GET' | 'POST' = 'GET', body = '', modify?: (init: RequestInit) => void) {
    const init = await prepare(path, action, method, body, modify);
    return { response: await app.request(`https://bb.example.test${path}`, init), init };
  }
  return { db, app, master, request, prepare, admins, consumes: () => consumes,
    setUnavailable: () => { unavailable = true; },
    setSource: (value: string) => { sourceProject = value; },
    setTarget: (value: string) => { targetProject = value; } };
}

test('real delegated create derives the borrower, preserves duplicate prevention and restricts own history', async () => {
  const f = fixture();
  try {
    const path = `${GLAB_PREFIX}/loans`;
    const body = JSON.stringify({ source: 'equipment', external_key: 'BB-1', borrowerUserId: 'other' });
    const first = await f.request(path, 'loans.create', 'POST', body);
    assert.equal(first.response.status, 201);
    const loan = (await first.response.json() as { loan: { borrower_user_id: string } }).loan;
    assert.equal(loan.borrower_user_id, 'borrower');
    const duplicate = await f.request(path, 'loans.create', 'POST', body);
    assert.equal(duplicate.response.status, 409);
    const mine = await f.request(`${path}/mine?all=1&userId=other`, 'loans.own.read');
    assert.equal(mine.response.status, 200);
    const items = (await mine.response.json() as { items: { borrower_user_id: string }[] }).items;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.borrower_user_id, 'borrower');
    assert.equal(mine.response.headers.get('cache-control'), 'private, no-store');
  } finally { f.db.close(); }
});

test('an unavailable authority, another source/target and altered bytes cannot create a loan', async () => {
  for (const mode of ['unavailable', 'source', 'target', 'body', 'header'] as const) {
    const f = fixture();
    try {
      if (mode === 'unavailable') f.setUnavailable();
      if (mode === 'source') f.setSource('another-service');
      if (mode === 'target') f.setTarget('another-target');
      const body = JSON.stringify({ source: 'equipment', external_key: 'BB-1' });
      const result = await f.request(`${GLAB_PREFIX}/loans`, 'loans.create', 'POST', body, init => {
        if (mode === 'body') init.body = body.replace('BB-1', 'BB-2');
        if (mode === 'header') (init.headers as Headers).set('content-type', 'text/plain');
      });
      assert.equal(result.response.status, 503, mode);
      assert.equal(f.db.prepare<[], { count: number }>('SELECT count(*) AS count FROM loan').get()?.count, 0);
    } finally { f.db.close(); }
  }
});

test('one capability cannot execute twice, including parallel reuse', async () => {
  const f = fixture();
  try {
    const path = `${GLAB_PREFIX}/me`;
    const init = await f.prepare(path, 'identity.self.read');
    const responses = await Promise.all([f.app.request(path, init), f.app.request(path, init)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 503]);
    assert.equal((await f.app.request(path, init)).status, 503);
    assert.equal(f.consumes(), 3);
  } finally { f.db.close(); }
});

test('legacy credentials, unknown operations and implicit HEAD never reach authority', async () => {
  const f = fixture();
  try {
    const credentials: Record<string, string>[] = [{ authorization: 'Bearer old-global' }, { cookie: 'cernere_token=old' }];
    for (const headers of credentials) {
      assert.equal((await f.app.request(`${GLAB_PREFIX}/me`, { headers })).status, 401);
    }
    for (const [method, path] of [['HEAD', '/items/equipment'], ['POST', '/items/equipment'], ['GET', '/loans/open'], ['POST', '/items/books/bulk']]) {
      assert.equal((await f.app.request(GLAB_PREFIX + path, { method })).status, 403);
    }
    assert.equal(f.consumes(), 0);
  } finally { f.db.close(); }
});

test('accepted holdings routes share the strict gate and retain local admin authorization', async () => {
  const f = fixture();
  try {
    const path = `${GLAB_PREFIX}/items/books`;
    assert.equal((await f.app.request(path, { headers: { authorization: 'Bearer old-global' } })).status, 401);
    assert.equal((await f.request(path, 'inventory.books.list')).response.status, 200);
    const body = JSON.stringify({ isbn: '9781234567890' });
    assert.equal((await f.request(path, 'inventory.books.create', 'POST', body)).response.status, 403);
    f.admins.add(user.id);
    f.master.lookupBook = async isbn => ({ isbn, title: 'Book', author: null, publisher: null, cover: null });
    assert.equal((await f.request(path, 'inventory.books.create', 'POST', body)).response.status, 201);
    const listed = await f.request(path, 'inventory.books.list');
    assert.equal((await listed.response.json() as { items: unknown[] }).items.length, 1);
    assert.equal(f.consumes(), 4);
  } finally { f.db.close(); }
});

test('delegated catalogue and borrow conflicts disclose no other actor or private loan fields', async () => {
  const f = fixture();
  try {
    upsertEquipment(f.db, { qrCode: 'BB-OTHER', name: 'Camera', spec: 'Shared specification', addedByUserId: 'private-creator' });
    createLoan(f.db, { source: 'equipment', externalKey: 'BB-OTHER', borrowerUserId: 'another-subject',
      borrowerDisplayName: 'Private borrower', dueAt: null, note: 'private-loan-note' });
    const catalogue = await f.request(`${GLAB_PREFIX}/items/equipment`, 'equipment.list');
    assert.equal(catalogue.response.status, 200);
    const items = (await catalogue.response.json() as { items: Record<string, unknown>[] }).items;
    assert.deepEqual(Object.keys(items[0] ?? {}).sort(), ['added_at', 'name', 'qr_code', 'spec']);
    assert.ok(!JSON.stringify(items).includes('private-creator'));
    const conflict = await f.request(`${GLAB_PREFIX}/loans`, 'loans.create', 'POST', JSON.stringify({ source: 'equipment', external_key: 'BB-OTHER' }));
    assert.equal(conflict.response.status, 409);
    assert.deepEqual(await conflict.response.json(), { error: 'already_borrowed' });
  } finally { f.db.close(); }
});

test('oversized input is rejected before consuming authority or touching the ledger', async () => {
  const f = fixture();
  try {
    const result = await f.request(`${GLAB_PREFIX}/loans`, 'loans.create', 'POST', 'x'.repeat(64 * 1024 + 1));
    assert.equal(result.response.status, 413);
    assert.equal(f.consumes(), 0);
    assert.equal(f.db.prepare<[], { count: number }>('SELECT count(*) AS count FROM loan').get()?.count, 0);
  } finally { f.db.close(); }
});

test('current missing equipment denies creation and an execution failure keeps its original status', async () => {
  const f = fixture();
  try {
    f.master.lookupEquipment = async () => null;
    const body = JSON.stringify({ source: 'equipment', external_key: 'missing' });
    assert.equal((await f.request(`${GLAB_PREFIX}/loans`, 'loans.create', 'POST', body)).response.status, 404);
    let executions = 0;
    f.master.lookupEquipment = async () => { executions++; throw new Error('Master execution failure'); };
    f.app.onError((_error, c) => c.json({ error: 'original_application_failure' }, 500));
    const failed = await f.request(`${GLAB_PREFIX}/loans`, 'loans.create', 'POST', body);
    assert.equal(failed.response.status, 500);
    assert.deepEqual(await failed.response.json(), { error: 'original_application_failure' });
    assert.equal(executions, 1);
    assert.equal(f.db.prepare<[], { count: number }>('SELECT count(*) AS count FROM loan').get()?.count, 0);
  } finally { f.db.close(); }
});

test('disconnect during master lookup prevents a later database commit', async () => {
  const f = fixture();
  const abort = new AbortController();
  f.master.lookupEquipment = async key => { abort.abort(); return { qrCode: key, name: 'Equipment', spec: null }; };
  try {
    const result = await f.request(`${GLAB_PREFIX}/loans`, 'loans.create', 'POST',
      JSON.stringify({ source: 'equipment', external_key: 'BB-1' }), init => { init.signal = abort.signal; });
    assert.equal(result.response.status, 408);
    assert.equal(f.db.prepare<[], { count: number }>('SELECT count(*) AS count FROM loan').get()?.count, 0);
  } finally { f.db.close(); }
});
