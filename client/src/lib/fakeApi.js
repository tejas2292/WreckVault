// In-memory stand-in for the v2 server (spec §2), for unit tests only.
// Stores what a real server would: ids, types, ciphertext, timestamps. authHash is kept
// as given (a real server bcrypts it).

function httpError(status, error) {
  const err = new Error(error);
  err.isAxiosError = true;
  err.response = { status, data: { error } };
  return err;
}

export function createFakeApi({ v1Users = [] } = {}) {
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const now = () => new Date((clock += 1000)).toISOString();
  const db = { users: [], collections: [], items: [], history: [], entries: [], agents: [], grants: [], reads: [] };
  let session = null; // {uid, v}
  let historySeq = 0;
  const calls = [];

  for (const u of v1Users) {
    db.users.push({ id: u.id, username: u.username, password: u.password, authVersion: 1, createdAt: now(), profileImage: null });
    for (const r of u.rows) db.entries.push({ ...r, userId: u.id });
  }

  const userOut = (u) => ({ id: u.id, username: u.username, createdAt: u.createdAt, profileImage: u.profileImage });
  const authOut = (u) => ({
    user: userOut(u), authVersion: u.authVersion,
    kdf: u.authVersion === 2 ? u.kdf : null, wrappedVaultKey: u.authVersion === 2 ? u.wrappedVaultKey : null,
  });
  const me = () => {
    const u = session && db.users.find((x) => x.id === session.uid);
    if (!u) throw httpError(401, 'Sign in again.');
    return u;
  };
  const v2 = () => {
    const u = me();
    if (u.authVersion !== 2) throw httpError(409, 'Upgrade your vault first');
    return u;
  };
  const itemOut = ({ userId, ...i }) => i; // eslint-disable-line no-unused-vars
  const ownItem = (u, id) => {
    const it = db.items.find((i) => i.id === id && i.userId === u.id);
    if (!it) throw httpError(404, 'Item not found');
    return it;
  };
  const ownCollection = (u, id) => {
    if (!db.collections.some((c) => c.id === id && c.userId === u.id)) throw httpError(400, 'Unknown collection');
  };
  const agentOut = (a) => ({
    id: a.id, name: a.name, canWrite: a.canWrite, createdAt: a.createdAt, lastUsedAt: a.lastUsedAt, revokedAt: a.revokedAt,
    collectionIds: db.grants.filter((g) => g.agentId === a.id).map((g) => g.collectionId),
  });
  const addCollections = (u, list) => list.forEach((c, i) => db.collections.push({
    id: c.id, userId: u.id, name: c.name, kind: c.kind, agentAccess: c.agentAccess, wrappedKey: c.wrappedKey, sort: i, createdAt: now(),
  }));

  const routes = {
    'GET /auth/status': () => ({ registrationOpen: db.users.length === 0 }),
    'GET /auth/me': () => authOut(me()),
    'POST /auth/prelogin': ({ username }) => {
      const u = db.users.find((x) => x.username === username);
      if (u && u.authVersion === 1) return { authVersion: 1 };
      if (u) return { authVersion: 2, kdf: u.kdf };
      return { authVersion: 2, kdf: { salt: 'AAAAAAAAAAAAAAAAAAAAAA==', params: { alg: 'argon2id', m: 65536, t: 3, p: 1 } } };
    },
    'POST /auth/login': (b) => {
      const u = db.users.find((x) => x.username === b.username);
      if (!u) throw httpError(401, 'Invalid credentials');
      if (u.authVersion === 1 ? b.password !== u.password : b.authHash !== u.authHash) throw httpError(401, 'Invalid credentials');
      session = { uid: u.id, v: u.authVersion };
      return authOut(u);
    },
    'POST /auth/logout': () => { session = null; return { ok: true }; },
    'POST /auth/register': (b) => {
      if (db.users.some((x) => x.username === b.username)) throw httpError(400, 'Username taken');
      const u = { id: db.users.length + 100, username: b.username, authVersion: 2, authHash: b.authHash, kdf: b.kdf, wrappedVaultKey: b.wrappedVaultKey, createdAt: now(), profileImage: null };
      db.users.push(u);
      addCollections(u, b.collections);
      session = { uid: u.id, v: 2 };
      return authOut(u);
    },
    'POST /auth/upgrade': (b) => {
      const u = me();
      if (u.authVersion !== 1) throw httpError(409, 'Already upgraded');
      if (b.password !== u.password) throw httpError(400, 'Wrong password');
      const mine = db.entries.filter((e) => e.userId === u.id).map((e) => e.id).sort();
      const sent = b.items.map((i) => i.legacyEntryId).sort();
      if (JSON.stringify(mine) !== JSON.stringify(sent)) throw httpError(400, 'Entry set mismatch');
      addCollections(u, b.collections);
      for (const i of b.items) {
        db.items.push({ id: i.id, userId: u.id, collectionId: i.collectionId, type: i.type, encrypted: i.encrypted, legacyEntryId: i.legacyEntryId, createdAt: i.createdAt, updatedAt: i.updatedAt, deletedAt: null });
      }
      Object.assign(u, { authVersion: 2, authHash: b.authHash, kdf: b.kdf, wrappedVaultKey: b.wrappedVaultKey });
      session = { uid: u.id, v: 2 };
      return { ...authOut(u), migrated: b.items.length };
    },
    'POST /auth/change-password': (b) => {
      const u = v2();
      if (b.currentAuthHash !== u.authHash) throw httpError(400, 'Current password is wrong');
      Object.assign(u, { authHash: b.newAuthHash, kdf: b.kdf, wrappedVaultKey: b.wrappedVaultKey });
      return { ok: true };
    },
    'GET /legacy/entries': () => {
      const u = me();
      return db.entries.filter((e) => e.userId === u.id).map(({ userId, ...e }) => e); // eslint-disable-line no-unused-vars
    },
    'GET /collections': () => {
      const u = v2();
      return db.collections.filter((c) => c.userId === u.id).map(({ userId, ...c }) => c); // eslint-disable-line no-unused-vars
    },
    'POST /collections': (b) => {
      const u = v2();
      db.collections.push({ ...b, userId: u.id, sort: 99, createdAt: now() });
      const { userId, ...c } = db.collections.at(-1); // eslint-disable-line no-unused-vars
      return c;
    },
    'GET /agents': () => {
      const u = v2();
      return db.agents.filter((a) => a.userId === u.id).reverse().map(agentOut);
    },
    'POST /agents': (b) => {
      const u = v2();
      const name = String(b.name || '');
      if (name.length < 1 || name.length > 60) throw httpError(400, 'Name must be 1 to 60 characters');
      if (!Array.isArray(b.grants) || !b.grants.length) throw httpError(400, 'Choose at least one collection');
      for (const g of b.grants) ownCollection(u, g.collectionId);
      db.agents.push({ id: b.id, userId: u.id, name, canWrite: b.canWrite === true, token: b.token, createdAt: now(), lastUsedAt: null, revokedAt: null });
      for (const g of b.grants) db.grants.push({ agentId: b.id, collectionId: g.collectionId, wrappedKey: g.wrappedKey });
      return agentOut(db.agents.at(-1));
    },
    'GET /items': () => {
      const u = v2();
      return db.items.filter((i) => i.userId === u.id).map(itemOut);
    },
    'POST /items': (b) => {
      const u = v2();
      ownCollection(u, b.collectionId);
      if (db.items.some((i) => i.id === b.id)) throw httpError(409, 'Duplicate id');
      const t = now();
      const it = { id: b.id, userId: u.id, collectionId: b.collectionId, type: b.type, encrypted: b.encrypted, legacyEntryId: null, createdAt: t, updatedAt: t, deletedAt: null };
      db.items.push(it);
      return itemOut(it);
    },
  };

  const paramRoutes = [
    ['PUT', /^\/items\/([^/]+)$/, (u, [id], b) => {
      const it = ownItem(u, id);
      ownCollection(u, b.collectionId);
      db.history.push({ id: ++historySeq, itemId: it.id, collectionId: it.collectionId, type: it.type, encrypted: it.encrypted, versionUpdatedAt: it.updatedAt, replacedAt: now() });
      Object.assign(it, { collectionId: b.collectionId, type: b.type, encrypted: b.encrypted, updatedAt: now() });
      return itemOut(it);
    }],
    ['DELETE', /^\/items\/([^/]+)$/, (u, [id]) => { const it = ownItem(u, id); it.deletedAt = now(); return itemOut(it); }],
    ['POST', /^\/items\/([^/]+)\/restore$/, (u, [id]) => { const it = ownItem(u, id); it.deletedAt = null; return itemOut(it); }],
    ['DELETE', /^\/items\/([^/]+)\/permanent$/, (u, [id]) => {
      const it = ownItem(u, id);
      if (!it.deletedAt) throw httpError(409, 'Move it to the trash first');
      db.items = db.items.filter((i) => i !== it);
      db.history = db.history.filter((h) => h.itemId !== id);
      return { ok: true };
    }],
    ['GET', /^\/items\/([^/]+)\/history$/, (u, [id]) => {
      ownItem(u, id);
      return db.history.filter((h) => h.itemId === id).reverse()
        .map((h) => ({ id: h.id, collectionId: h.collectionId, type: h.type, encrypted: h.encrypted, versionUpdatedAt: h.versionUpdatedAt, replacedAt: h.replacedAt }));
    }],
    ['DELETE', /^\/agents\/([^/]+)$/, (u, [id]) => {
      const a = db.agents.find((x) => x.id === id && x.userId === u.id);
      if (!a) throw httpError(404, 'Device not found');
      if (!a.revokedAt) a.revokedAt = now();
      return agentOut(a);
    }],
    ['GET', /^\/items\/([^/?]+)\/reads(?:\?limit=(\d+))?$/, (u, [id, limit]) => {
      ownItem(u, id);
      const n = Math.min(Number(limit) || 50, 200);
      return db.reads.filter((r) => r.itemId === id).reverse().slice(0, n).map((r) => ({
        id: r.id, agentId: r.agentId, agentName: db.agents.find((a) => a.id === r.agentId)?.name ?? null, encrypted: r.encrypted, createdAt: r.createdAt,
      }));
    }],
  ];

  async function call(method, url, body) {
    calls.push({ method, url, body });
    const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
    const direct = routes[`${method} ${url}`];
    if (direct) return { data: clone(direct(clone(body) || {})) };
    for (const [m, re, fn] of paramRoutes) {
      const match = m === method && url.match(re);
      if (match) return { data: clone(fn(v2(), match.slice(1), clone(body) || {})) };
    }
    throw httpError(404, `No route ${method} ${url}`);
  }

  return {
    db,
    calls,
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body),
    put: (url, body) => call('PUT', url, body),
    delete: (url, config) => call('DELETE', url, config?.data),
  };
}
