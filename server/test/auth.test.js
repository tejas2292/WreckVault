const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const {
  setupDb, makeApp, client, b64, fakeKdf, fakeSealed, defaultCollections, registerV2,
} = require('./helpers');
const { createV1User, createV1Entry } = require('../scripts/legacy-fixtures');

const V1_PASSWORD = 'correct horse battery staple';
let db;
let pool;

before(async () => {
  delete process.env.ALLOW_REGISTRATION;
  db = await setupDb();
  pool = db.pool;
});
after(async () => {
  delete process.env.ALLOW_REGISTRATION;
  await db.teardown();
});

test('health reports the database', async () => {
  const res = await request(makeApp(pool)).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, db: true });
});

test('registration is open only on an empty server or with ALLOW_REGISTRATION=true', async () => {
  const app = makeApp(pool);
  let res = await request(app).get('/api/auth/status');
  assert.deepEqual(res.body, { registrationOpen: true });

  const first = await registerV2(app, 'first-user');
  assert.equal(first.body.authVersion, 2);
  assert.equal(first.body.user.username, 'first-user');
  assert.deepEqual(first.body.kdf, first.kdf);
  assert.ok(first.body.wrappedVaultKey.startsWith('wv1.'));
  assert.ok(Object.keys(first.body.user).sort().join() === 'createdAt,id,profileImage,username');

  res = await request(app).get('/api/auth/status');
  assert.deepEqual(res.body, { registrationOpen: false });

  const c = client(app);
  res = await c.post('/api/auth/register').send({
    username: 'second-user', authHash: b64(32), kdf: fakeKdf(), wrappedVaultKey: fakeSealed(), collections: defaultCollections(),
  });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /closed/i);

  process.env.ALLOW_REGISTRATION = 'true';
  try {
    res = await request(app).get('/api/auth/status');
    assert.deepEqual(res.body, { registrationOpen: true });
    await registerV2(app, 'second-user');
    // Username taken
    res = await c.post('/api/auth/register').send({
      username: 'second-user', authHash: b64(32), kdf: fakeKdf(), wrappedVaultKey: fakeSealed(), collections: defaultCollections(),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /taken/);
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }

  // The v2 account's password_hash is bcrypt(authHash), and auth_hash is set.
  const row = (await pool.query("SELECT * FROM users WHERE username = 'first-user'")).rows[0];
  assert.equal(row.auth_version, 2);
  assert.ok(row.password_hash && row.auth_hash);
  const cols = await pool.query('SELECT kind FROM collections WHERE user_id = $1 ORDER BY sort', [row.id]);
  assert.deepEqual(cols.rows.map((r) => r.kind), ['personal', 'alfred']);
});

test('register validates its body', async () => {
  process.env.ALLOW_REGISTRATION = 'true';
  try {
    const c = client(makeApp(pool));
    const base = { username: 'bad-body', authHash: b64(32), kdf: fakeKdf(), wrappedVaultKey: fakeSealed(), collections: defaultCollections() };
    for (const patch of [
      { kdf: { salt: 'short', params: {} } },
      { collections: [] },
      { collections: [{ ...defaultCollections()[0], id: 'not-a-uuid' }] },
      { collections: [{ ...defaultCollections()[0], kind: 'weird' }] },
      { authHash: '' },
    ]) {
      const res = await c.post('/api/auth/register').send({ ...base, ...patch });
      assert.equal(res.status, 400, JSON.stringify(patch));
      assert.equal(typeof res.body.error, 'string');
    }
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }
});

test('prelogin answers v1, v2 and unknown users without revealing unknown ones', async () => {
  const app = makeApp(pool);
  await createV1User(pool, 'legacy-pre', V1_PASSWORD);
  process.env.ALLOW_REGISTRATION = 'true';
  let v2;
  try {
    v2 = await registerV2(app, 'modern-pre');
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }
  const c = client(app);

  let res = await c.post('/api/auth/prelogin').send({ username: 'legacy-pre' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { authVersion: 1 });

  res = await c.post('/api/auth/prelogin').send({ username: 'modern-pre' });
  assert.deepEqual(res.body, { authVersion: 2, kdf: v2.kdf });

  res = await c.post('/api/auth/prelogin').send({ username: 'nobody-here' });
  assert.equal(res.body.authVersion, 2);
  assert.deepEqual(res.body.kdf.params, { alg: 'argon2id', m: 65536, t: 3, p: 1 });
  assert.equal(Buffer.from(res.body.kdf.salt, 'base64').length, 16);
  const secret = (await pool.query("SELECT value FROM server_settings WHERE key = 'jwt_secret'")).rows[0].value;
  const expected = crypto.createHmac('sha256', secret).update('prelogin:nobody-here').digest().subarray(0, 16).toString('base64');
  assert.equal(res.body.kdf.salt, expected);
  // Stable across calls, different per username.
  const again = await c.post('/api/auth/prelogin').send({ username: 'nobody-here' });
  assert.equal(again.body.kdf.salt, res.body.kdf.salt);
  const other = await c.post('/api/auth/prelogin').send({ username: 'nobody-else' });
  assert.notEqual(other.body.kdf.salt, res.body.kdf.salt);
});

test('prelogin is rate limited to 30 per 15 minutes', async () => {
  const c = client(makeApp(pool));
  for (let i = 0; i < 30; i++) {
    const res = await c.post('/api/auth/prelogin').send({ username: `probe-${i}` });
    assert.equal(res.status, 200);
  }
  const res = await c.post('/api/auth/prelogin').send({ username: 'probe-x' });
  assert.equal(res.status, 429);
});

test('v1 login, v2 login, wrong credentials, and login_logs rows', async () => {
  const app = makeApp(pool);
  await createV1User(pool, 'legacy-login', V1_PASSWORD);
  process.env.ALLOW_REGISTRATION = 'true';
  let v2;
  try {
    v2 = await registerV2(app, 'modern-login');
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }

  const c1 = client(app);
  let res = await c1.post('/api/auth/login').set('User-Agent', 'test-agent/1').send({ username: 'legacy-login', password: V1_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.authVersion, 1);
  assert.equal(res.body.kdf, null);
  assert.equal(res.body.wrappedVaultKey, null);
  assert.equal(res.body.user.username, 'legacy-login');
  const cookie = res.headers['set-cookie'].find((s) => s.startsWith('wv_session='));
  assert.ok(cookie, 'sets wv_session');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Secure/);
  res = await c1.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.authVersion, 1);

  const c2 = client(app);
  res = await c2.post('/api/auth/login').send({ username: 'modern-login', authHash: v2.authHash });
  assert.equal(res.status, 200);
  assert.equal(res.body.authVersion, 2);
  assert.deepEqual(res.body.kdf, v2.kdf);
  res = await c2.get('/api/auth/me');
  assert.equal(res.body.user.username, 'modern-login');
  assert.ok(res.body.wrappedVaultKey);

  // Secure cookie behind an HTTPS proxy on loopback.
  res = await client(app).post('/api/auth/login').set('X-Forwarded-Proto', 'https')
    .send({ username: 'modern-login', authHash: v2.authHash });
  assert.match(res.headers['set-cookie'].join(';'), /Secure/);

  // Each wrong-credential case uses a fresh app so the limiter doesn't interfere.
  const wrong = [
    { username: 'legacy-login', password: 'wrong password' },
    { username: 'legacy-login', authHash: v2.authHash },          // v1 user sending authHash
    { username: 'modern-login', password: 'anything' },           // v2 user sending password
    { username: 'modern-login', authHash: b64(32) },
    { username: 'no-such-user', password: 'x' },
  ];
  for (const body of wrong) {
    res = await client(makeApp(pool)).post('/api/auth/login').send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
    assert.equal(res.headers['set-cookie'], undefined);
  }

  const logs = await pool.query("SELECT * FROM login_logs WHERE username = 'legacy-login' ORDER BY id");
  assert.equal(logs.rows[0].success, true);
  assert.equal(logs.rows[0].user_agent, 'test-agent/1');
  assert.ok(logs.rows[0].ip_address && !logs.rows[0].ip_address.startsWith('::ffff:'));
  assert.ok(logs.rows.some((r) => r.success === false));
  const unknown = await pool.query("SELECT success FROM login_logs WHERE username = 'no-such-user'");
  assert.deepEqual(unknown.rows, [{ success: false }]);

  // Login logs endpoint: camelCase, limit honoured.
  res = await c2.get('/api/auth/login-logs?limit=2');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['createdAt', 'id', 'ipAddress', 'success', 'userAgent', 'username']);
});

test('login limiter blocks the 5th failed attempt but not successful logins', async () => {
  const app = makeApp(pool);
  await createV1User(pool, 'limited', V1_PASSWORD);
  const c = client(app);
  for (let i = 0; i < 3; i++) {
    assert.equal((await c.post('/api/auth/login').send({ username: 'limited', password: 'nope' })).status, 400);
  }
  // Successes don't count.
  for (let i = 0; i < 3; i++) {
    assert.equal((await c.post('/api/auth/login').send({ username: 'limited', password: V1_PASSWORD })).status, 200);
  }
  assert.equal((await c.post('/api/auth/login').send({ username: 'limited', password: 'nope' })).status, 400);
  const blocked = await c.post('/api/auth/login').send({ username: 'limited', password: V1_PASSWORD });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many login attempts/);
});

test('writes without X-WV-Client are rejected with 403', async () => {
  const app = makeApp(pool);
  for (const [method, url] of [
    ['post', '/api/auth/login'], ['post', '/api/auth/prelogin'], ['post', '/api/auth/register'],
    ['put', '/api/auth/me'], ['delete', '/api/auth/me'], ['post', '/api/items'], ['post', '/api/auth/logout'],
  ]) {
    const res = await request(app)[method](url).send({});
    assert.equal(res.status, 403, `${method} ${url}`);
    assert.deepEqual(res.body, { error: 'Missing client header' });
  }
  const wrongValue = await request(app).post('/api/auth/login').set('X-WV-Client', '0').send({});
  assert.equal(wrongValue.status, 403);
});

test('session routes need a valid cookie', async () => {
  const app = makeApp(pool);
  for (const [method, url] of [
    ['get', '/api/auth/me'], ['get', '/api/legacy/entries'], ['get', '/api/items'], ['get', '/api/collections'],
    ['get', '/api/auth/login-logs'], ['post', '/api/auth/upgrade'], ['post', '/api/auth/change-password'],
  ]) {
    const res = await request(app)[method](url).set('X-WV-Client', '1').send({});
    assert.equal(res.status, 401, `${method} ${url}`);
    assert.equal(typeof res.body.error, 'string');
  }
  const forged = await request(app).get('/api/auth/me').set('Cookie', 'wv_session=not.a.jwt');
  assert.equal(forged.status, 401);
});

test('logout clears the session', async () => {
  const app = makeApp(pool);
  await createV1User(pool, 'leaver', V1_PASSWORD);
  const c = client(app);
  await c.post('/api/auth/login').send({ username: 'leaver', password: V1_PASSWORD });
  assert.equal((await c.get('/api/auth/me')).status, 200);
  const res = await c.post('/api/auth/logout');
  assert.deepEqual(res.body, { ok: true });
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('legacy entries are returned read-only, camelCase, scoped to the user', async () => {
  const app = makeApp(pool);
  const u = await createV1User(pool, 'legacy-reader', V1_PASSWORD);
  const other = await createV1User(pool, 'legacy-other', V1_PASSWORD);
  await createV1Entry(pool, u.id, V1_PASSWORD, { serviceName: 'Mail', accountUsername: 'a@example.com', category: 'email', isFavorite: true, secret: 'pw1' });
  await createV1Entry(pool, u.id, V1_PASSWORD, { serviceName: 'Card', entryType: 'card', secret: { card_number: '4111111111111111' } });
  await createV1Entry(pool, other.id, V1_PASSWORD, { serviceName: 'Not yours', secret: 'x' });

  const c = client(app);
  await c.post('/api/auth/login').send({ username: 'legacy-reader', password: V1_PASSWORD });
  const res = await c.get('/api/legacy/entries');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  const mail = res.body.find((e) => e.serviceName === 'Mail');
  assert.deepEqual(Object.keys(mail).sort(), [
    'accountUsername', 'category', 'createdAt', 'encryptedBlob', 'entryType', 'id', 'isFavorite', 'serviceName', 'updatedAt', 'websiteUrl',
  ]);
  assert.equal(mail.isFavorite, true);
  assert.equal(mail.entryType, 'password');
  // v1 sessions can't use v2 collections/items.
  assert.equal((await c.get('/api/items')).status, 409);
  assert.equal((await c.get('/api/collections')).status, 409);
});

test('profile image update', async () => {
  const app = makeApp(pool);
  await createV1User(pool, 'pictured', V1_PASSWORD);
  const c = client(app);
  await c.post('/api/auth/login').send({ username: 'pictured', password: V1_PASSWORD });
  let res = await c.put('/api/auth/me').send({ profileImage: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.profileImage, 'data:image/png;base64,iVBORw0KGgo=');
  res = await c.put('/api/auth/me').send({ profileImage: 'javascript:alert(1)' });
  assert.equal(res.status, 400);
  res = await c.put('/api/auth/me').send({ profileImage: null });
  assert.equal(res.body.user.profileImage, null);
});

test('change password (v2) updates auth material atomically; v1 gets 409', async () => {
  process.env.ALLOW_REGISTRATION = 'true';
  let v2;
  const app = makeApp(pool);
  try {
    v2 = await registerV2(app, 'changer');
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }
  const before = (await pool.query("SELECT password_hash FROM users WHERE username = 'changer'")).rows[0];
  const newHash = b64(32);
  const newKdf = fakeKdf();
  const newWrapped = fakeSealed();

  let res = await v2.c.post('/api/auth/change-password').send({
    currentAuthHash: b64(32), newAuthHash: newHash, kdf: newKdf, wrappedVaultKey: newWrapped,
  });
  assert.equal(res.status, 400);

  res = await v2.c.post('/api/auth/change-password').send({
    currentAuthHash: v2.authHash, newAuthHash: newHash, kdf: newKdf, wrappedVaultKey: newWrapped,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });

  const me = await v2.c.get('/api/auth/me');
  assert.deepEqual(me.body.kdf, newKdf);
  assert.equal(me.body.wrappedVaultKey, newWrapped);
  const after = (await pool.query("SELECT password_hash FROM users WHERE username = 'changer'")).rows[0];
  assert.equal(after.password_hash, before.password_hash, 'password_hash untouched');

  assert.equal((await client(makeApp(pool)).post('/api/auth/login').send({ username: 'changer', authHash: v2.authHash })).status, 400);
  assert.equal((await client(app).post('/api/auth/login').send({ username: 'changer', authHash: newHash })).status, 200);

  await createV1User(pool, 'legacy-changer', V1_PASSWORD);
  const c1 = client(app);
  await c1.post('/api/auth/login').send({ username: 'legacy-changer', password: V1_PASSWORD });
  res = await c1.post('/api/auth/change-password').send({
    currentAuthHash: b64(32), newAuthHash: newHash, kdf: newKdf, wrappedVaultKey: newWrapped,
  });
  assert.equal(res.status, 409);
});

test('delete account re-verifies, then removes everything the user owns', async () => {
  const app = makeApp(pool);
  // v1 account with entries
  const u = await createV1User(pool, 'deleter-v1', V1_PASSWORD);
  await createV1Entry(pool, u.id, V1_PASSWORD, { serviceName: 'Gone', secret: 'x' });
  const keep = await createV1User(pool, 'bystander', V1_PASSWORD);
  await createV1Entry(pool, keep.id, V1_PASSWORD, { serviceName: 'Stays', secret: 'y' });

  const c = client(app);
  await c.post('/api/auth/login').send({ username: 'deleter-v1', password: V1_PASSWORD });
  let res = await c.delete('/api/auth/me').send({ password: 'wrong' });
  assert.equal(res.status, 400);
  res = await c.delete('/api/auth/me').send({ password: V1_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [u.id])).rows.length, 0);
  assert.equal((await pool.query('SELECT 1 FROM vault_entries WHERE user_id = $1', [u.id])).rows.length, 0);
  assert.equal((await pool.query('SELECT 1 FROM vault_entries WHERE user_id = $1', [keep.id])).rows.length, 1);
  assert.equal((await c.get('/api/auth/me')).status, 401);

  // v2 account with items and history
  process.env.ALLOW_REGISTRATION = 'true';
  let v2;
  try {
    v2 = await registerV2(app, 'deleter-v2');
  } finally {
    delete process.env.ALLOW_REGISTRATION;
  }
  const itemId = crypto.randomUUID();
  await v2.c.post('/api/items').send({ id: itemId, collectionId: v2.collections[0].id, type: 'login', encrypted: fakeSealed() });
  await v2.c.put(`/api/items/${itemId}`).send({ collectionId: v2.collections[0].id, type: 'login', encrypted: fakeSealed() });
  res = await v2.c.delete('/api/auth/me').send({ password: 'not how v2 works' });
  assert.equal(res.status, 400);
  res = await v2.c.delete('/api/auth/me').send({ authHash: v2.authHash });
  assert.equal(res.status, 200);
  const uid = v2.body.user.id;
  for (const table of ['items', 'collections', 'item_history']) {
    assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [uid])).rows.length, 0, table);
  }
  assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [uid])).rows.length, 0);
});

test('unknown API routes and bad JSON return {error}', async () => {
  const app = makeApp(pool);
  let res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, 'string');
  res = await request(app).post('/api/auth/prelogin').set('X-WV-Client', '1').set('Content-Type', 'application/json').send('{bad');
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, 'string');
});
