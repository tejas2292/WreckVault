const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setupDb, makeApp, client, uuid, b64, fakeKdf, fakeSealed, defaultCollections,
} = require('./helpers');
const { createV1User, createV1Entry, SAMPLE_ENTRIES } = require('../scripts/legacy-fixtures');

const PASSWORD = 'correct horse battery staple';
let db;
let pool;

before(async () => {
  delete process.env.ALLOW_REGISTRATION;
  db = await setupDb();
  pool = db.pool;
});
after(() => db.teardown());

// Everything the upgrade must never change, as exact text.
const snapshot = async (userId) => {
  const entries = await pool.query(
    'SELECT row_to_json(v)::text AS j FROM vault_entries v WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  const all = await pool.query('SELECT md5(string_agg(row_to_json(v)::text, \'|\' ORDER BY id)) AS h FROM vault_entries v');
  const user = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return { entries: entries.rows.map((r) => r.j), allEntriesHash: all.rows[0].h, passwordHash: user.rows[0].password_hash };
};

// A v1 user with the sample entries, logged in. Returns {c, user, entries}.
const legacyUser = async (app, username) => {
  const user = await createV1User(pool, username, PASSWORD);
  const entries = [];
  for (const e of SAMPLE_ENTRIES) entries.push(await createV1Entry(pool, user.id, PASSWORD, e));
  const c = client(app);
  const res = await c.post('/api/auth/login').send({ username, password: PASSWORD });
  assert.equal(res.status, 200);
  return { c, user, entries };
};

const upgradeBody = (entries, overrides = {}) => {
  const collections = defaultCollections();
  const personal = collections[0].id;
  const items = entries.map((e) => ({
    id: uuid(),
    collectionId: personal,
    type: e.entry_type === 'card' ? 'card' : e.entry_type === 'note' ? 'secure_note' : 'login',
    encrypted: fakeSealed(),
    legacyEntryId: e.id,
    createdAt: new Date(e.created_at).toISOString(),
    updatedAt: new Date(e.updated_at).toISOString(),
  }));
  return {
    password: PASSWORD, authHash: b64(32), kdf: fakeKdf(), wrappedVaultKey: fakeSealed(), collections, items, ...overrides,
  };
};

test('upgrade migrates every entry and leaves vault_entries and password_hash byte-identical', async () => {
  const app = makeApp(pool);
  const { c, user, entries } = await legacyUser(app, 'alice');
  const bystander = await createV1User(pool, 'bob', PASSWORD);
  await createV1Entry(pool, bystander.id, PASSWORD, { serviceName: 'Bob mail', secret: 'b' });

  const before = await snapshot(user.id);
  const body = upgradeBody(entries);
  const res = await c.post('/api/auth/upgrade').send(body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.authVersion, 2);
  assert.equal(res.body.migrated, entries.length);
  assert.deepEqual(res.body.kdf, body.kdf);
  assert.equal(res.body.wrappedVaultKey, body.wrappedVaultKey);
  assert.equal(res.body.user.username, 'alice');

  const afterSnap = await snapshot(user.id);
  assert.deepEqual(afterSnap.entries, before.entries, 'vault_entries rows unchanged');
  assert.equal(afterSnap.allEntriesHash, before.allEntriesHash, 'whole vault_entries table unchanged');
  assert.equal(afterSnap.passwordHash, before.passwordHash, 'password_hash unchanged');

  const row = (await pool.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
  assert.equal(row.auth_version, 2);
  assert.ok(row.auth_hash && row.upgraded_at);
  assert.equal(row.kdf_salt, body.kdf.salt);

  // The re-issued cookie is a v2 session.
  const items = await c.get('/api/items');
  assert.equal(items.status, 200);
  assert.equal(items.body.length, entries.length);
  const byLegacy = new Map(items.body.map((i) => [i.legacyEntryId, i]));
  for (const sent of body.items) {
    const got = byLegacy.get(sent.legacyEntryId);
    assert.equal(got.id, sent.id);
    assert.equal(got.encrypted, sent.encrypted);
    assert.equal(got.type, sent.type);
    assert.equal(new Date(got.createdAt).toISOString(), sent.createdAt);
    assert.equal(got.deletedAt, null);
  }
  const cols = await c.get('/api/collections');
  assert.deepEqual(cols.body.map((x) => x.kind), ['personal', 'alfred']);

  // Legacy rows stay readable after the upgrade.
  assert.equal((await c.get('/api/legacy/entries')).body.length, entries.length);

  // The v2 login now works with the authHash; the old v1 password path is refused.
  assert.equal((await client(app).post('/api/auth/login').send({ username: 'alice', authHash: body.authHash })).status, 200);
  assert.equal((await client(makeApp(pool)).post('/api/auth/login').send({ username: 'alice', password: PASSWORD })).status, 400);

  // Upgrading twice: 409.
  const again = await c.post('/api/auth/upgrade').send(upgradeBody(entries));
  assert.equal(again.status, 409);
});

test('a v1 cookie issued before the upgrade stops working after it', async () => {
  const app = makeApp(pool);
  const { c, entries } = await legacyUser(app, 'two-tabs');
  const other = client(app);
  await other.post('/api/auth/login').send({ username: 'two-tabs', password: PASSWORD });
  assert.equal((await c.post('/api/auth/upgrade').send(upgradeBody(entries))).status, 200);
  const stale = await other.post('/api/auth/upgrade').send(upgradeBody(entries));
  assert.equal(stale.status, 401);
});

test('upgrade is rejected unless legacyEntryIds match the user\'s entries exactly', async () => {
  const app = makeApp(pool);
  const { c, user, entries } = await legacyUser(app, 'carol');
  const dave = await legacyUser(app, 'dave');
  const before = await snapshot(user.id);

  const cases = {
    missing: (b) => { b.items.pop(); },
    extra: (b) => {
      b.items.push({ ...b.items[0], id: uuid(), legacyEntryId: dave.entries[0].id });
    },
    duplicated: (b) => { b.items[1].legacyEntryId = b.items[0].legacyEntryId; },
    'nonexistent id': (b) => { b.items[0].legacyEntryId = 99999999; },
    'missing legacyEntryId': (b) => { delete b.items[0].legacyEntryId; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const body = upgradeBody(entries);
    mutate(body);
    const res = await c.post('/api/auth/upgrade').send(body);
    assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.body)}`);
    assert.equal(typeof res.body.error, 'string');
  }

  // Bad shapes
  for (const [name, mutate] of Object.entries({
    'bad type': (b) => { b.items[0].type = 'password'; },
    'bad uuid': (b) => { b.items[0].id = 'abc'; },
    'foreign collection': (b) => { b.items[0].collectionId = uuid(); },
  })) {
    const body = upgradeBody(entries);
    mutate(body);
    assert.equal((await c.post('/api/auth/upgrade').send(body)).status, 400, name);
  }

  // Wrong password
  const wrong = await c.post('/api/auth/upgrade').send(upgradeBody(entries, { password: 'not it' }));
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /password/i);

  // Nothing was written by any rejected attempt.
  const row = (await pool.query('SELECT auth_version, auth_hash FROM users WHERE id = $1', [user.id])).rows[0];
  assert.equal(row.auth_version, 1);
  assert.equal(row.auth_hash, null);
  assert.equal((await pool.query('SELECT 1 FROM items WHERE user_id = $1', [user.id])).rows.length, 0);
  assert.equal((await pool.query('SELECT 1 FROM collections WHERE user_id = $1', [user.id])).rows.length, 0);
  assert.deepEqual(await snapshot(user.id), before);

  // And it still succeeds afterwards.
  assert.equal((await c.post('/api/auth/upgrade').send(upgradeBody(entries))).status, 200);
});

test('upgrade with a reused item id rolls back with 409', async () => {
  const app = makeApp(pool);
  const first = await legacyUser(app, 'erin');
  const firstBody = upgradeBody(first.entries);
  assert.equal((await first.c.post('/api/auth/upgrade').send(firstBody)).status, 200);

  const second = await legacyUser(app, 'frank');
  const body = upgradeBody(second.entries);
  body.items[0].id = firstBody.items[0].id;
  const res = await second.c.post('/api/auth/upgrade').send(body);
  assert.equal(res.status, 409);
  const row = (await pool.query('SELECT auth_version FROM users WHERE id = $1', [second.user.id])).rows[0];
  assert.equal(row.auth_version, 1);
  assert.equal((await pool.query('SELECT 1 FROM collections WHERE user_id = $1', [second.user.id])).rows.length, 0);
});

test('a v1 user with no entries can upgrade with zero items', async () => {
  const app = makeApp(pool);
  await createV1User(pool, 'empty', PASSWORD);
  const c = client(app);
  await c.post('/api/auth/login').send({ username: 'empty', password: PASSWORD });
  const res = await c.post('/api/auth/upgrade').send(upgradeBody([]));
  assert.equal(res.status, 200);
  assert.equal(res.body.migrated, 0);
});

test('v2 accounts cannot call upgrade', async () => {
  process.env.ALLOW_REGISTRATION = 'true';
  try {
    const c = client(makeApp(pool));
    await c.post('/api/auth/register').send({
      username: 'already-v2', authHash: b64(32), kdf: fakeKdf(), wrappedVaultKey: fakeSealed(), collections: defaultCollections(),
    });
    const res = await c.post('/api/auth/upgrade').send(upgradeBody([]));
    assert.equal(res.status, 409);
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }
});
