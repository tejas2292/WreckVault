// Test harness: each test file gets its own throwaway database, created next to the one
// in DATABASE_URL (which must allow CREATE DATABASE) and dropped afterwards. Nothing in
// the database named by DATABASE_URL itself is read or written.
const crypto = require('crypto');
const request = require('supertest');
const { createPool, migrate } = require('../db');
const { createApp } = require('../app');

const setupDb = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL to a disposable Postgres server (see README: Tests).');
  }
  const name = `wv_test_${crypto.randomBytes(6).toString('hex')}`;
  const admin = createPool(process.env.DATABASE_URL);
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString());
  await migrate(pool);
  return {
    pool,
    teardown: async () => {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
};

// Low bcrypt cost keeps the suite fast; production uses 12.
const makeApp = (pool) => createApp(pool, { bcryptCost: 4 });

// A cookie-keeping client that always sends the CSRF header on writes.
const client = (app) => {
  const agent = request.agent(app);
  const withHeader = (method) => (url) => agent[method](url).set('X-WV-Client', '1');
  return {
    agent,
    get: (url) => agent.get(url),
    post: withHeader('post'),
    put: withHeader('put'),
    delete: withHeader('delete'),
  };
};

const uuid = () => crypto.randomUUID();
const b64 = (n) => crypto.randomBytes(n).toString('base64');
const fakeKdf = () => ({ salt: b64(16), params: { alg: 'argon2id', m: 65536, t: 3, p: 1 } });
const fakeSealed = () => `wv1.${b64(12)}.${b64(48)}`;

const defaultCollections = () => [
  { id: uuid(), name: 'Personal', kind: 'personal', agentAccess: false, wrappedKey: fakeSealed() },
  { id: uuid(), name: 'ALFRED', kind: 'alfred', agentAccess: true, wrappedKey: fakeSealed() },
];

// Registers a v2 user; returns {c, authHash, kdf, collections, body}.
const registerV2 = async (app, username) => {
  const c = client(app);
  const authHash = b64(32);
  const kdf = fakeKdf();
  const collections = defaultCollections();
  const res = await c.post('/api/auth/register').send({
    username, authHash, kdf, wrappedVaultKey: fakeSealed(), collections,
  });
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { c, authHash, kdf, collections, body: res.body };
};

module.exports = {
  setupDb, makeApp, client, uuid, b64, fakeKdf, fakeSealed, defaultCollections, registerV2,
};
