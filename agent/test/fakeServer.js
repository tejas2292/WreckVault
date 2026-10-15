// In-process fake of the §8.3 agent API, plus a fixture vault sealed with the real crypto.
import http from 'node:http';
import {
  randomBytes, uuidv4, deriveAgentKeys, wrapGrantKey, sealItem, openItem, openRead,
} from '../src/crypto.js';
import { formatConnection } from '../src/connection.js';

export function makeFixture({ canWrite = true, name = 'Test laptop' } = {}) {
  const secret = randomBytes(32);
  const agentId = uuidv4();
  const { agentToken, agentWrapKey } = deriveAgentKeys(secret);
  const alfred = { id: uuidv4(), name: 'ALFRED', kind: 'alfred', key: randomBytes(32) };
  const ops = { id: uuidv4(), name: 'Ops', kind: 'custom', key: randomBytes(32) };
  const ungranted = { id: uuidv4(), name: 'Personal', kind: 'personal', key: randomBytes(32) };
  const collections = [alfred, ops, ungranted];
  const grants = { [alfred.id]: wrapGrantKey(agentWrapKey, alfred.key, agentId, alfred.id), [ops.id]: wrapGrantKey(agentWrapKey, ops.key, agentId, ops.id) };

  const items = [];
  const reads = [];
  const t = '2026-10-01T10:00:00.000Z';
  const add = (coll, type, payload, extra = {}) => {
    const id = uuidv4();
    items.push({ id, collectionId: coll.id, type, encrypted: sealItem(coll.key, id, type, payload), createdAt: t, updatedAt: t, deletedAt: null, ...extra });
    return id;
  };
  const base = { v: 1, notes: '', tags: [], project: '', favorite: false, status: 'active', supersededBy: null, links: [], attachments: [] };
  const ids = {
    stagingDb: add(alfred, 'database', { ...base, title: 'Staging DB', project: 'DEMO', tags: ['db'], fields: [
      { id: 'f1', label: 'Host', kind: 'mono', value: '10.0.0.5' },
      { id: 'f2', label: 'User', kind: 'mono', value: 'alice' },
      { id: 'f3', label: 'Password', kind: 'secret', value: 'correct horse battery staple' },
    ], customKey: { keep: true } }),
    stagingDbOld: add(alfred, 'database', { ...base, title: 'Staging DB (old)', status: 'superseded', fields: [
      { id: 'f1', label: 'Password', kind: 'secret', value: 'old-pass' },
    ] }),
    github: add(alfred, 'login', { ...base, title: 'GitHub', fields: [
      { id: 'f1', label: 'Username', kind: 'text', value: 'alice' },
      { id: 'f2', label: 'Password', kind: 'secret', value: 'gh-pass-123' },
      { id: 'f3', label: 'One-time code', kind: 'totp', value: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
    ] }),
    githubBot: add(ops, 'api_key', { ...base, title: 'GitHub bot token', fields: [
      { id: 'f1', label: 'Key', kind: 'secret', value: 'ghp_exampleexampleexample' },
      { id: 'f2', label: 'Notes', kind: 'multi', value: 'line1\nline2' },
    ] }),
    trashed: add(alfred, 'login', { ...base, title: 'Trashed thing', fields: [] }, { deletedAt: t }),
    personal: add(ungranted, 'login', { ...base, title: 'Bank', fields: [{ id: 'f1', label: 'Password', kind: 'secret', value: 'nope' }] }),
  };

  return {
    secret, agentId, agentToken, agentWrapKey, name, collections, grants, items, reads, ids, alfred, ops, ungranted,
    agent: { id: agentId, name, canWrite },
    connection: (server) => formatConnection({ server, agentId, name, secret }),
    decryptItem: (id) => {
      const row = items.find((i) => i.id === id);
      const coll = collections.find((c) => c.id === row.collectionId);
      return openItem(coll.key, row.id, row.type, row.encrypted);
    },
    decryptRead: (r) => {
      const row = items.find((i) => i.id === r.itemId);
      const coll = collections.find((c) => c.id === row.collectionId);
      return openRead(coll.key, r.itemId, r.id, r.encrypted);
    },
  };
}

export async function startFakeServer(fx, { port = 0 } = {}) {
  const granted = (cid) => Object.prototype.hasOwnProperty.call(fx.grants, cid);
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const stats = { requests: [] };
  const handler = async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : undefined;
    stats.requests.push(`${req.method} ${req.url}`);
    if (req.headers.authorization !== `Bearer wva1.${fx.agentId}.${fx.agentToken}`) return send(res, 401, { error: 'This device is not recognised.' });
    const url = req.url;
    if (req.method === 'GET' && url === '/api/agent/v1/me') {
      return send(res, 200, {
        agent: fx.agent,
        collections: fx.collections.filter((c) => granted(c.id)).map((c) => ({ id: c.id, name: c.name, kind: c.kind, wrappedKey: fx.grants[c.id] })),
      });
    }
    if (req.method === 'GET' && url === '/api/agent/v1/items') {
      return send(res, 200, fx.items.filter((i) => granted(i.collectionId) && !i.deletedAt)
        .map(({ id, collectionId, type, encrypted, createdAt, updatedAt }) => ({ id, collectionId, type, encrypted, createdAt, updatedAt })));
    }
    if (req.method === 'POST' && url === '/api/agent/v1/items') {
      if (!fx.agent.canWrite) return send(res, 403, { error: 'This device has read-only access. Reconnect it with "Read and write" to make changes.' });
      if (!granted(body.collectionId)) return send(res, 403, { error: 'This device has no access to that collection.' });
      if (fx.items.some((i) => i.id === body.id)) return send(res, 409, { error: 'An item with that id already exists.' });
      const row = { id: body.id, collectionId: body.collectionId, type: body.type, encrypted: body.encrypted, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null };
      fx.items.push(row);
      return send(res, 200, row);
    }
    let m = url.match(/^\/api\/agent\/v1\/items\/([^/]+)$/);
    if (req.method === 'PUT' && m) {
      if (!fx.agent.canWrite) return send(res, 403, { error: 'This device has read-only access. Reconnect it with "Read and write" to make changes.' });
      const row = fx.items.find((i) => i.id === m[1] && !i.deletedAt);
      if (!row) return send(res, 404, { error: 'Item not found.' });
      if (!granted(row.collectionId) || !granted(body.collectionId)) return send(res, 403, { error: 'This device has no access to that collection.' });
      Object.assign(row, { collectionId: body.collectionId, type: body.type, encrypted: body.encrypted, updatedAt: new Date().toISOString() });
      return send(res, 200, row);
    }
    m = url.match(/^\/api\/agent\/v1\/items\/([^/]+)\/reads$/);
    if (req.method === 'POST' && m) {
      const row = fx.items.find((i) => i.id === m[1] && granted(i.collectionId));
      if (!row) return send(res, 404, { error: 'Item not found.' });
      if (fx.reads.some((r) => r.id === body.id)) return send(res, 409, { error: 'A read with that id already exists.' });
      fx.reads.push({ itemId: m[1], id: body.id, encrypted: body.encrypted });
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: `No API route for ${req.method} ${url}.` });
  };

  let server;
  const listen = (p) => new Promise((resolve) => {
    server = http.createServer((req, res) => { handler(req, res).catch((e) => send(res, 500, { error: e.message })); });
    server.listen(p, '127.0.0.1', () => resolve(server.address().port));
  });
  const actualPort = await listen(port);
  const api = {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    stats,
    async stop() {
      await new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });
    },
    async restart() { await listen(actualPort); },
  };
  return api;
}
