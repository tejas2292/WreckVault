const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const { setupDb, makeApp, uuid, fakeSealed, registerV2 } = require('./helpers');

let db;
let pool;
let app;
let A;
let B;
let work; // A's custom "Work" collection

before(async () => {
  process.env.ALLOW_REGISTRATION = 'true';
  db = await setupDb();
  pool = db.pool;
  app = makeApp(pool);
  A = await registerV2(app, 'alice');
  B = await registerV2(app, 'bob');
  work = { id: uuid(), name: 'Work', kind: 'custom', agentAccess: true, wrappedKey: fakeSealed() };
  const res = await A.c.post('/api/collections').send(work);
  assert.equal(res.status, 200);
});
after(async () => {
  delete process.env.ALLOW_REGISTRATION;
  await db.teardown();
});

const personalOf = (u) => u.collections.find((c) => c.kind === 'personal');
const alfredOf = (u) => u.collections.find((c) => c.kind === 'alfred');

// §8.1: agentToken = base64url(HKDF-SHA256(deviceSecret, salt = empty, info, 32)).
const deviceToken = () => {
  const secret = crypto.randomBytes(32);
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), 'wreckvault/v2/agent-auth', 32)).toString('base64url');
};

// Registers a device for user u through the web API. Returns {id, token, auth, row}.
const connect = async (u, { name = 'MacBook Air', canWrite = false, collectionIds } = {}) => {
  const id = uuid();
  const token = deviceToken();
  const grants = (collectionIds || [alfredOf(u).id]).map((collectionId) => ({ collectionId, wrappedKey: fakeSealed() }));
  const res = await u.c.post('/api/agents').send({ id, name, canWrite, token, grants });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { id, token, grants, auth: `Bearer wva1.${id}.${token}`, row: res.body };
};

// Requests with no cookie jar and no X-WV-Client header.
const as = (dev, targetApp = app) => ({
  get: (url) => request(targetApp).get(url).set('Authorization', dev.auth),
  post: (url) => request(targetApp).post(url).set('Authorization', dev.auth),
  put: (url) => request(targetApp).put(url).set('Authorization', dev.auth),
});

const newItem = (collectionId, overrides = {}) => ({
  id: uuid(), collectionId, type: 'api_key', encrypted: fakeSealed(), ...overrides,
});
const addItem = async (u, collectionId, overrides) => {
  const it = newItem(collectionId, overrides);
  const res = await u.c.post('/api/items').send(it);
  assert.equal(res.status, 200);
  return it;
};

test('POST /api/agents creates a device, stores only SHA-256(token), lists newest first', async () => {
  const dev = await connect(A, { name: '  Build box  ', canWrite: true, collectionIds: [alfredOf(A).id, work.id] });
  assert.deepEqual(Object.keys(dev.row).sort(), ['canWrite', 'collectionIds', 'createdAt', 'id', 'lastUsedAt', 'name', 'revokedAt']);
  assert.equal(dev.row.id, dev.id);
  assert.equal(dev.row.name, 'Build box');
  assert.equal(dev.row.canWrite, true);
  assert.equal(dev.row.lastUsedAt, null);
  assert.equal(dev.row.revokedAt, null);
  assert.deepEqual(dev.row.collectionIds, [alfredOf(A).id, work.id]);

  const stored = (await pool.query('SELECT * FROM agents WHERE id = $1', [dev.id])).rows[0];
  assert.equal(stored.token_hash, crypto.createHash('sha256').update(dev.token).digest('hex'));
  assert.ok(!JSON.stringify(stored).includes(dev.token), 'the raw token is never stored');
  const grants = (await pool.query('SELECT * FROM agent_grants WHERE agent_id = $1 ORDER BY collection_id', [dev.id])).rows;
  assert.equal(grants.length, 2);

  const later = await connect(A, { name: 'Later' });
  const res = await A.c.get('/api/agents');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.slice(0, 2).map((a) => a.id), [later.id, dev.id]);
  // B sees none of A's devices.
  assert.ok(!(await B.c.get('/api/agents')).body.some((a) => a.id === dev.id));
  // Duplicate id -> 409.
  const dup = await A.c.post('/api/agents').send({
    id: dev.id, name: 'Dup', canWrite: false, token: deviceToken(), grants: [{ collectionId: alfredOf(A).id, wrappedKey: fakeSealed() }],
  });
  assert.equal(dup.status, 409);
});

test('POST /api/agents validates its body', async () => {
  const base = () => ({
    id: uuid(), name: 'Laptop', canWrite: false, token: deviceToken(),
    grants: [{ collectionId: alfredOf(A).id, wrappedKey: fakeSealed() }],
  });
  const cases = [
    ['bad id', { id: 'nope' }],
    ['uuid v1', { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }],
    ['empty name', { name: '' }],
    ['blank name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(61) }],
    ['non-string name', { name: 42 }],
    ['canWrite not boolean', { canWrite: 'yes' }],
    ['missing token', { token: undefined }],
    ['empty token', { token: '' }],
    ['token not base64url', { token: `${'a'.repeat(42)}+` }],
    ['token too short', { token: crypto.randomBytes(16).toString('base64url') }],
    ['token too long', { token: crypto.randomBytes(33).toString('base64url') }],
    ['token padded base64', { token: crypto.randomBytes(32).toString('base64') }],
    ['no grants', { grants: [] }],
    ['grants not array', { grants: 'all' }],
    ['grant bad collection id', { grants: [{ collectionId: 'x', wrappedKey: fakeSealed() }] }],
    ['grant bad wrappedKey', { grants: [{ collectionId: alfredOf(A).id, wrappedKey: 'plain-key' }] }],
    ['grant duplicate', { grants: [{ collectionId: alfredOf(A).id, wrappedKey: fakeSealed() }, { collectionId: alfredOf(A).id, wrappedKey: fakeSealed() }] }],
    ['unknown collection', { grants: [{ collectionId: uuid(), wrappedKey: fakeSealed() }] }],
    ['other user\'s collection', { grants: [{ collectionId: alfredOf(A).id, wrappedKey: fakeSealed() }, { collectionId: alfredOf(B).id, wrappedKey: fakeSealed() }] }],
  ];
  for (const [label, patch] of cases) {
    const res = await A.c.post('/api/agents').send({ ...base(), ...patch });
    assert.equal(res.status, 400, label);
    assert.equal(typeof res.body.error, 'string', label);
  }
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM agents WHERE name = $1', ['Laptop'])).rows[0].n, 0);
  // A 60-character name is fine; the web route still needs the CSRF header.
  assert.equal((await A.c.post('/api/agents').send({ ...base(), name: 'x'.repeat(60) })).status, 200);
  assert.equal((await A.c.agent.post('/api/agents').send(base())).status, 403);
  // Signed out -> 401.
  assert.equal((await request(app).get('/api/agents')).status, 401);
});

test('bearer auth: ok, bad token, malformed header, cookie-only, revoked, v1 owner', async () => {
  // Its own app instance: this test makes many failed auths, which the limiter counts.
  const fresh = makeApp(pool);
  const C = await registerV2(fresh, 'carol');
  const dev = await connect(A);
  let res = await as(dev, fresh).get('/api/agent/v1/me');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.agent, { id: dev.id, name: 'MacBook Air', canWrite: false });

  const badToken = { auth: `Bearer wva1.${dev.id}.${deviceToken()}` };
  res = await as(badToken, fresh).get('/api/agent/v1/me');
  assert.equal(res.status, 401);
  assert.equal(typeof res.body.error, 'string');
  assert.equal((await as({ auth: `Bearer wva1.${uuid()}.${dev.token}` }, fresh).get('/api/agent/v1/me')).status, 401, 'unknown agent');

  for (const auth of [
    '', 'Bearer', `Basic wva1.${dev.id}.${dev.token}`, `Bearer wva2.${dev.id}.${dev.token}`,
    `Bearer ${dev.id}.${dev.token}`, `Bearer wva1.${dev.id}`, `Bearer wva1.not-a-uuid.${dev.token}`,
    `Bearer wva1.${dev.id}.${dev.token}.extra`, `Bearer wva1.${dev.id}.${dev.token}=`,
  ]) {
    assert.equal((await as({ auth }, fresh).get('/api/agent/v1/me')).status, 401, `header: ${auth.slice(0, 20)}`);
  }
  assert.equal((await request(fresh).get('/api/agent/v1/items')).status, 401, 'no header');

  // The cookie session is not accepted on agent routes, with or without the CSRF header.
  assert.equal((await C.c.get('/api/auth/me')).status, 200, 'the cookie itself is valid');
  assert.equal((await C.c.get('/api/agent/v1/me')).status, 401);
  assert.equal((await C.c.get('/api/agent/v1/items')).status, 401);
  assert.equal((await C.c.post('/api/agent/v1/items').send(newItem(alfredOf(C).id))).status, 401);

  // An agent whose owner is not on auth version 2 is rejected.
  const cDev = await connect(C);
  assert.equal((await as(cDev, fresh).get('/api/agent/v1/me')).status, 200);
  await pool.query('UPDATE users SET auth_version = 1 WHERE username = $1', ['carol']);
  assert.equal((await as(cDev, fresh).get('/api/agent/v1/me')).status, 401);
});

test('last_used_at is set on use and written at most once a minute', async () => {
  const dev = await connect(A);
  await as(dev).get('/api/agent/v1/me');
  const first = (await pool.query('SELECT last_used_at FROM agents WHERE id = $1', [dev.id])).rows[0].last_used_at;
  assert.ok(first);
  await as(dev).get('/api/agent/v1/items');
  const second = (await pool.query('SELECT last_used_at FROM agents WHERE id = $1', [dev.id])).rows[0].last_used_at;
  assert.equal(second.getTime(), first.getTime());
  await pool.query(`UPDATE agents SET last_used_at = now() - interval '2 minutes' WHERE id = $1`, [dev.id]);
  await as(dev).get('/api/agent/v1/me');
  const third = (await pool.query('SELECT last_used_at FROM agents WHERE id = $1', [dev.id])).rows[0].last_used_at;
  assert.ok(Date.now() - third.getTime() < 30 * 1000);
  const listed = (await A.c.get('/api/agents')).body.find((a) => a.id === dev.id);
  assert.equal(new Date(listed.lastUsedAt).getTime(), third.getTime());
});

test('an agent sees only its granted collections and their non-trashed items', async () => {
  const dev = await connect(A, { collectionIds: [alfredOf(A).id, work.id] });
  const inAlfred = await addItem(A, alfredOf(A).id);
  const inWork = await addItem(A, work.id, { type: 'ssh_host' });
  const inPersonal = await addItem(A, personalOf(A).id);
  const trashed = await addItem(A, alfredOf(A).id);
  assert.equal((await A.c.delete(`/api/items/${trashed.id}`)).status, 200);
  const bobs = await addItem(B, alfredOf(B).id);

  let res = await as(dev).get('/api/agent/v1/me');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.collections.map((c) => c.id), [alfredOf(A).id, work.id]);
  assert.deepEqual(Object.keys(res.body.collections[0]).sort(), ['id', 'kind', 'name', 'wrappedKey']);
  // wrappedKey is the grant's agent-wrapped key, not the vault-wrapped collection key.
  assert.equal(res.body.collections[0].wrappedKey, dev.grants[0].wrappedKey);
  assert.notEqual(res.body.collections[0].wrappedKey, alfredOf(A).wrappedKey);

  res = await as(dev).get('/api/agent/v1/items');
  assert.equal(res.status, 200);
  const ids = res.body.map((i) => i.id);
  assert.ok(ids.includes(inAlfred.id));
  assert.ok(ids.includes(inWork.id));
  assert.ok(!ids.includes(inPersonal.id), 'not Personal');
  assert.ok(!ids.includes(trashed.id), 'not trashed');
  assert.ok(!ids.includes(bobs.id), 'not another user\'s');
  for (const i of res.body) assert.ok([alfredOf(A).id, work.id].includes(i.collectionId));
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['collectionId', 'createdAt', 'encrypted', 'id', 'type', 'updatedAt']);
  assert.equal(res.body.find((i) => i.id === inWork.id).encrypted, inWork.encrypted);
});

test('a read-only agent gets 403 on POST and PUT and changes nothing', async () => {
  const dev = await connect(A, { canWrite: false });
  const it = await addItem(A, alfredOf(A).id);
  let res = await as(dev).post('/api/agent/v1/items').send(newItem(alfredOf(A).id));
  assert.equal(res.status, 403);
  assert.match(res.body.error, /read-only/);
  res = await as(dev).put(`/api/agent/v1/items/${it.id}`).send({ collectionId: alfredOf(A).id, type: 'api_key', encrypted: fakeSealed() });
  assert.equal(res.status, 403);
  const row = (await pool.query('SELECT encrypted FROM items WHERE id = $1', [it.id])).rows[0];
  assert.equal(row.encrypted, it.encrypted);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM item_history WHERE item_id = $1', [it.id])).rows[0].n, 0);
});

test('a write agent creates and updates in granted collections, with history, and nowhere else', async () => {
  const dev = await connect(A, { canWrite: true, collectionIds: [alfredOf(A).id, work.id] });

  // Create (no X-WV-Client header needed).
  const it = newItem(alfredOf(A).id);
  let res = await as(dev).post('/api/agent/v1/items').send(it);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, it.id);
  assert.equal(res.body.collectionId, alfredOf(A).id);
  const owner = (await pool.query('SELECT user_id FROM items WHERE id = $1', [it.id])).rows[0].user_id;
  assert.equal(owner, A.body.user.id);
  assert.ok((await A.c.get('/api/items')).body.some((i) => i.id === it.id), 'the web app sees it');

  assert.equal((await as(dev).post('/api/agent/v1/items').send(it)).status, 409, 'duplicate id');
  assert.equal((await as(dev).post('/api/agent/v1/items').send(newItem(alfredOf(A).id, { type: 'bogus' }))).status, 400);
  assert.equal((await as(dev).post('/api/agent/v1/items').send(newItem(personalOf(A).id))).status, 403, 'ungranted collection');
  assert.equal((await as(dev).post('/api/agent/v1/items').send(newItem(alfredOf(B).id))).status, 403, 'other user\'s collection');

  // Update, moving between granted collections -> one history row holding the old version.
  const v2 = fakeSealed();
  res = await as(dev).put(`/api/agent/v1/items/${it.id}`).send({ collectionId: work.id, type: 'login', encrypted: v2 });
  assert.equal(res.status, 200);
  assert.equal(res.body.encrypted, v2);
  assert.equal(res.body.collectionId, work.id);
  res = await A.c.get(`/api/items/${it.id}/history`);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].encrypted, it.encrypted);
  assert.equal(res.body[0].collectionId, alfredOf(A).id);
  assert.equal(res.body[0].type, 'api_key');

  // Moving into an ungranted collection -> 403, nothing changes.
  res = await as(dev).put(`/api/agent/v1/items/${it.id}`).send({ collectionId: personalOf(A).id, type: 'login', encrypted: fakeSealed() });
  assert.equal(res.status, 403);
  // Editing an item that sits in an ungranted collection -> 403.
  const personal = await addItem(A, personalOf(A).id);
  res = await as(dev).put(`/api/agent/v1/items/${personal.id}`).send({ collectionId: alfredOf(A).id, type: 'login', encrypted: fakeSealed() });
  assert.equal(res.status, 403);
  assert.equal((await pool.query('SELECT collection_id FROM items WHERE id = $1', [personal.id])).rows[0].collection_id, personalOf(A).id);
  // Another user's item, an unknown item, a trashed item -> 404; a bad id -> 400.
  const bobs = await addItem(B, alfredOf(B).id);
  assert.equal((await as(dev).put(`/api/agent/v1/items/${bobs.id}`).send({ collectionId: alfredOf(A).id, type: 'login', encrypted: fakeSealed() })).status, 404);
  assert.equal((await as(dev).put(`/api/agent/v1/items/${uuid()}`).send({ collectionId: alfredOf(A).id, type: 'login', encrypted: fakeSealed() })).status, 404);
  const trashed = await addItem(A, alfredOf(A).id);
  await A.c.delete(`/api/items/${trashed.id}`);
  assert.equal((await as(dev).put(`/api/agent/v1/items/${trashed.id}`).send({ collectionId: alfredOf(A).id, type: 'login', encrypted: fakeSealed() })).status, 404);
  assert.equal((await as(dev).put('/api/agent/v1/items/nope').send({ collectionId: alfredOf(A).id, type: 'login', encrypted: fakeSealed() })).status, 400);

  const now = (await pool.query('SELECT encrypted, collection_id FROM items WHERE id = $1', [it.id])).rows[0];
  assert.equal(now.encrypted, v2);
  assert.equal(now.collection_id, work.id);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM item_history WHERE item_id = $1', [it.id])).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM item_history WHERE item_id = $1', [bobs.id])).rows[0].n, 0);
});

test('reads are logged by the agent and listed for the owner, newest first', async () => {
  const dev = await connect(A, { name: 'Read logger' });
  const it = await addItem(A, alfredOf(A).id);
  const first = { id: uuid(), encrypted: fakeSealed() };
  const second = { id: uuid(), encrypted: fakeSealed() };
  let res = await as(dev).post(`/api/agent/v1/items/${it.id}/reads`).send(first);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await as(dev).post(`/api/agent/v1/items/${it.id}/reads`).send(second)).status, 200);
  assert.equal((await as(dev).post(`/api/agent/v1/items/${it.id}/reads`).send(second)).status, 409, 'duplicate read id');
  assert.equal((await as(dev).post(`/api/agent/v1/items/${it.id}/reads`).send({ id: 'x', encrypted: fakeSealed() })).status, 400);
  assert.equal((await as(dev).post(`/api/agent/v1/items/${it.id}/reads`).send({ id: uuid(), encrypted: '' })).status, 400);

  // Ungranted (Personal), another user's and unknown items -> 404.
  const personal = await addItem(A, personalOf(A).id);
  assert.equal((await as(dev).post(`/api/agent/v1/items/${personal.id}/reads`).send({ id: uuid(), encrypted: fakeSealed() })).status, 404);
  const bobs = await addItem(B, alfredOf(B).id);
  assert.equal((await as(dev).post(`/api/agent/v1/items/${bobs.id}/reads`).send({ id: uuid(), encrypted: fakeSealed() })).status, 404);
  assert.equal((await as(dev).post(`/api/agent/v1/items/${uuid()}/reads`).send({ id: uuid(), encrypted: fakeSealed() })).status, 404);

  res = await A.c.get(`/api/items/${it.id}/reads`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['agentId', 'agentName', 'createdAt', 'encrypted', 'id']);
  assert.deepEqual(res.body.map((r) => r.id), [second.id, first.id]);
  assert.equal(res.body[0].agentId, dev.id);
  assert.equal(res.body[0].agentName, 'Read logger');
  assert.equal(res.body[1].encrypted, first.encrypted);
  assert.equal((await A.c.get(`/api/items/${it.id}/reads?limit=1`)).body.length, 1);
  assert.equal((await A.c.get(`/api/items/${personal.id}/reads`)).body.length, 0);

  // Only the owner can list them.
  assert.equal((await B.c.get(`/api/items/${it.id}/reads`)).status, 404);
  assert.equal((await A.c.get(`/api/items/${uuid()}/reads`)).status, 404);
  assert.equal((await A.c.get('/api/items/nope/reads')).status, 400);
  assert.equal((await request(app).get(`/api/items/${it.id}/reads`)).status, 401);
});

test('DELETE /api/agents/:id revokes the device, idempotently', async () => {
  const dev = await connect(A, { canWrite: true });
  assert.equal((await as(dev).get('/api/agent/v1/me')).status, 200);

  let res = await A.c.delete(`/api/agents/${dev.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, dev.id);
  assert.ok(res.body.revokedAt);
  const revokedAt = res.body.revokedAt;

  assert.equal((await as(dev).get('/api/agent/v1/me')).status, 401);
  assert.equal((await as(dev).get('/api/agent/v1/items')).status, 401);
  assert.equal((await as(dev).post('/api/agent/v1/items').send(newItem(alfredOf(A).id))).status, 401);

  res = await A.c.delete(`/api/agents/${dev.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.revokedAt, revokedAt, 'keeps the first revocation time');
  assert.equal((await A.c.get('/api/agents')).body.find((a) => a.id === dev.id).revokedAt, revokedAt);

  assert.equal((await B.c.delete(`/api/agents/${dev.id}`)).status, 404, 'not B\'s device');
  assert.equal((await A.c.delete(`/api/agents/${uuid()}`)).status, 404);
  assert.equal((await A.c.delete('/api/agents/nope')).status, 400);
  assert.equal((await A.c.agent.delete(`/api/agents/${dev.id}`)).status, 403, 'CSRF header still required');
});

test('agent routes need no X-WV-Client header and have their own 404', async () => {
  const dev = await connect(A, { canWrite: true });
  const res = await request(app).post('/api/agent/v1/items').set('Authorization', dev.auth).send(newItem(alfredOf(A).id));
  assert.equal(res.status, 200);
  const nf = await as(dev).get('/api/agent/v1/collections');
  assert.equal(nf.status, 404);
  assert.equal(typeof nf.body.error, 'string');
});

test('failed agent auths are limited to 20 per 15 minutes per IP; other errors do not count', async () => {
  // Fresh apps so the limiter starts empty.
  const limited = makeApp(pool);
  const dev = await connect(A);
  const bad = { auth: `Bearer wva1.${dev.id}.${deviceToken()}` };
  for (let i = 0; i < 20; i += 1) {
    assert.equal((await as(bad, limited).get('/api/agent/v1/me')).status, 401, `attempt ${i + 1}`);
  }
  const res = await as(bad, limited).get('/api/agent/v1/me');
  assert.equal(res.status, 429);
  assert.equal(typeof res.body.error, 'string');
  assert.equal((await as(dev, limited).get('/api/agent/v1/me')).status, 429, 'blocked IP stays blocked');

  // 403s and 404s from a signed-in device are not failed auths.
  const other = makeApp(pool);
  for (let i = 0; i < 25; i += 1) {
    assert.equal((await as(dev, other).post('/api/agent/v1/items').send(newItem(alfredOf(A).id))).status, 403);
  }
  assert.equal((await as(dev, other).get('/api/agent/v1/me')).status, 200);
});

test('deleting the account removes its devices, grants and reads', async () => {
  const D = await registerV2(app, 'dave');
  const dev = await connect(D);
  const it = await addItem(D, alfredOf(D).id);
  assert.equal((await as(dev).post(`/api/agent/v1/items/${it.id}/reads`).send({ id: uuid(), encrypted: fakeSealed() })).status, 200);
  const res = await D.c.delete('/api/auth/me').send({ authHash: D.authHash });
  assert.equal(res.status, 200);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM agents WHERE id = $1', [dev.id])).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM agent_grants WHERE agent_id = $1', [dev.id])).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM item_reads WHERE item_id = $1', [it.id])).rows[0].n, 0);
  assert.equal((await as(dev).get('/api/agent/v1/me')).status, 401);
});
