const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDb, makeApp, uuid, fakeSealed, registerV2 } = require('./helpers');

let db;
let pool;
let app;
let A;
let B;

before(async () => {
  process.env.ALLOW_REGISTRATION = 'true';
  db = await setupDb();
  pool = db.pool;
  app = makeApp(pool);
  A = await registerV2(app, 'user-a');
  B = await registerV2(app, 'user-b');
});
after(async () => {
  delete process.env.ALLOW_REGISTRATION;
  await db.teardown();
});

const newItem = (u, overrides = {}) => ({
  id: uuid(), collectionId: u.collections[0].id, type: 'login', encrypted: fakeSealed(), ...overrides,
});

test('collections: list and create', async () => {
  let res = await A.c.get('/api/collections');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((c) => c.name), ['Personal', 'ALFRED']);
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['agentAccess', 'createdAt', 'id', 'kind', 'name', 'sort', 'wrappedKey']);

  const id = uuid();
  res = await A.c.post('/api/collections').send({ id, name: 'Work', kind: 'custom', agentAccess: false, wrappedKey: fakeSealed() });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, id);
  assert.equal(res.body.kind, 'custom');
  assert.equal(res.body.sort, 2);

  res = await A.c.post('/api/collections').send({ id, name: 'Again', wrappedKey: fakeSealed() });
  assert.equal(res.status, 409);
  res = await A.c.post('/api/collections').send({ id: uuid(), name: 'Sneaky', kind: 'alfred', wrappedKey: fakeSealed() });
  assert.equal(res.status, 400);
  res = await A.c.post('/api/collections').send({ id: 'nope', name: 'Bad', wrappedKey: fakeSealed() });
  assert.equal(res.status, 400);

  // B doesn't see A's collections.
  res = await B.c.get('/api/collections');
  assert.ok(!res.body.some((c) => c.id === id));
});

test('items: create, validate, update with history, list', async () => {
  const item = newItem(A);
  let res = await A.c.post('/api/items').send(item);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), [
    'collectionId', 'createdAt', 'deletedAt', 'encrypted', 'id', 'legacyEntryId', 'type', 'updatedAt',
  ]);
  assert.equal(res.body.legacyEntryId, null);
  const v1Updated = res.body.updatedAt;

  assert.equal((await A.c.post('/api/items').send(item)).status, 409, 'duplicate id');
  assert.equal((await A.c.post('/api/items').send(newItem(A, { type: 'password' }))).status, 400, 'bad type');
  assert.equal((await A.c.post('/api/items').send(newItem(A, { id: 'x' }))).status, 400, 'bad id');
  assert.equal((await A.c.post('/api/items').send(newItem(A, { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }))).status, 400, 'uuid v1 rejected');
  assert.equal((await A.c.post('/api/items').send(newItem(A, { encrypted: '' }))).status, 400, 'empty ciphertext');
  assert.equal((await A.c.post('/api/items').send(newItem(A, { collectionId: uuid() }))).status, 400, 'unknown collection');

  // Every valid type is accepted.
  for (const type of ['api_key', 'ssh_host', 'database', 'server', 'vpn', 'cloud_credential', 'webhook', 'card', 'secure_note', 'identity', 'wifi', 'license']) {
    assert.equal((await A.c.post('/api/items').send(newItem(A, { type }))).status, 200, type);
  }

  // Update twice -> two history rows, newest first, each holding the replaced version.
  const second = fakeSealed();
  res = await A.c.put(`/api/items/${item.id}`).send({ collectionId: A.collections[1].id, type: 'api_key', encrypted: second });
  assert.equal(res.status, 200);
  assert.equal(res.body.encrypted, second);
  assert.equal(res.body.collectionId, A.collections[1].id);
  assert.equal(res.body.type, 'api_key');
  const third = fakeSealed();
  res = await A.c.put(`/api/items/${item.id}`).send({ collectionId: A.collections[0].id, type: 'login', encrypted: third });
  assert.equal(res.status, 200);

  res = await A.c.get(`/api/items/${item.id}/history`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['collectionId', 'encrypted', 'id', 'replacedAt', 'type', 'versionUpdatedAt']);
  assert.equal(res.body[0].encrypted, second);
  assert.equal(res.body[0].type, 'api_key');
  assert.equal(res.body[0].collectionId, A.collections[1].id);
  assert.equal(res.body[1].encrypted, item.encrypted);
  assert.equal(res.body[1].type, 'login');
  assert.equal(res.body[1].versionUpdatedAt, v1Updated);

  assert.equal((await A.c.put(`/api/items/${item.id}`).send({ collectionId: A.collections[0].id, type: 'bogus', encrypted: third })).status, 400);
  assert.equal((await A.c.put(`/api/items/${uuid()}`).send({ collectionId: A.collections[0].id, type: 'login', encrypted: third })).status, 404);
  assert.equal((await A.c.put('/api/items/not-a-uuid').send({ collectionId: A.collections[0].id, type: 'login', encrypted: third })).status, 400);

  res = await A.c.get('/api/items');
  assert.equal(res.status, 200);
  assert.ok(res.body.some((i) => i.id === item.id && i.encrypted === third));
});

test('trash, restore and permanent delete', async () => {
  const item = newItem(A);
  await A.c.post('/api/items').send(item);
  await A.c.put(`/api/items/${item.id}`).send({ collectionId: item.collectionId, type: 'login', encrypted: fakeSealed() });

  // Permanent delete needs the item in the trash first.
  let res = await A.c.delete(`/api/items/${item.id}/permanent`);
  assert.equal(res.status, 409);

  res = await A.c.delete(`/api/items/${item.id}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.deletedAt);
  const trashedAt = res.body.deletedAt;
  // Trashed items are still listed.
  res = await A.c.get('/api/items');
  assert.equal(res.body.find((i) => i.id === item.id).deletedAt, trashedAt);
  // Deleting again keeps the original timestamp.
  res = await A.c.delete(`/api/items/${item.id}`);
  assert.equal(res.body.deletedAt, trashedAt);

  res = await A.c.post(`/api/items/${item.id}/restore`);
  assert.equal(res.status, 200);
  assert.equal(res.body.deletedAt, null);

  await A.c.delete(`/api/items/${item.id}`);
  res = await A.c.delete(`/api/items/${item.id}/permanent`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal((await pool.query('SELECT 1 FROM items WHERE id = $1', [item.id])).rows.length, 0);
  assert.equal((await pool.query('SELECT 1 FROM item_history WHERE item_id = $1', [item.id])).rows.length, 0);
  assert.equal((await A.c.get(`/api/items/${item.id}/history`)).status, 404);
  assert.equal((await A.c.delete(`/api/items/${item.id}/permanent`)).status, 404);
  assert.equal((await A.c.post(`/api/items/${uuid()}/restore`)).status, 404);
});

test('user B cannot read, change or delete user A\'s items or use A\'s collections', async () => {
  const item = newItem(A);
  await A.c.post('/api/items').send(item);
  await A.c.put(`/api/items/${item.id}`).send({ collectionId: item.collectionId, type: 'login', encrypted: fakeSealed() });
  const snapshot = (await pool.query('SELECT row_to_json(i)::text AS j FROM items i WHERE id = $1', [item.id])).rows[0].j;

  let res = await B.c.get('/api/items');
  assert.ok(!res.body.some((i) => i.id === item.id));
  assert.equal((await B.c.get(`/api/items/${item.id}/history`)).status, 404);
  assert.equal((await B.c.put(`/api/items/${item.id}`).send({ collectionId: B.collections[0].id, type: 'login', encrypted: fakeSealed() })).status, 404);
  assert.equal((await B.c.delete(`/api/items/${item.id}`)).status, 404);
  assert.equal((await B.c.post(`/api/items/${item.id}/restore`)).status, 404);
  assert.equal((await B.c.delete(`/api/items/${item.id}/permanent`)).status, 404);

  // B can't create into, or move its own item into, A's collection.
  res = await B.c.post('/api/items').send(newItem(B, { collectionId: A.collections[0].id }));
  assert.equal(res.status, 400);
  const bItem = newItem(B);
  await B.c.post('/api/items').send(bItem);
  res = await B.c.put(`/api/items/${bItem.id}`).send({ collectionId: A.collections[0].id, type: 'login', encrypted: fakeSealed() });
  assert.equal(res.status, 400);
  // B can't claim A's item id either.
  assert.equal((await B.c.post('/api/items').send(newItem(B, { id: item.id }))).status, 409);

  const after = (await pool.query('SELECT row_to_json(i)::text AS j FROM items i WHERE id = $1', [item.id])).rows[0].j;
  assert.equal(after, snapshot, 'A\'s item unchanged');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM item_history WHERE item_id = $1', [item.id])).rows[0].n, 1);
});

test('the 25 MB JSON limit accepts large items and rejects bigger bodies', async () => {
  const big = newItem(A, { encrypted: 'x'.repeat(5 * 1024 * 1024) });
  assert.equal((await A.c.post('/api/items').send(big)).status, 200);
  const huge = newItem(A, { encrypted: 'x'.repeat(26 * 1024 * 1024) });
  const res = await A.c.post('/api/items').send(huge);
  assert.equal(res.status, 413);
  assert.equal(typeof res.body.error, 'string');
});
