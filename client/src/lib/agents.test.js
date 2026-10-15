import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeApi } from './fakeApi.js';
import { registerFlow } from './sessionCore.js';
import { loadVault, createItemOp, listAgentsOp, createAgentOp, revokeAgentOp, getReadsOp } from './vaultCore.js';
import { blankItem } from './itemModel.js';
import { clearKeys, setVaultKey, setCollectionKey, getCollectionKey } from '../crypto/keystore.js';
import { parseConnectionString, agentToken, agentWrapKey, openGrant, sealRead } from '../crypto/agent.js';
import { uuidv4 } from '../crypto/bytes.js';

const PW = 'correct horse battery staple';
const SERVER = 'http://10.0.0.5:3011';

async function freshVault() {
  clearKeys();
  const api = createFakeApi();
  const reg = await registerFlow(api, 'alice', PW);
  setVaultKey(reg.vaultKey);
  for (const [id, k] of Object.entries(reg.collectionKeys)) setCollectionKey(id, k);
  const v = await loadVault(api);
  return { api, ...v };
}

describe('Claude access (agents)', () => {
  beforeEach(() => clearKeys());

  it('createAgent registers the device with a token and grants the connection string can open', async () => {
    const { api, collections } = await freshVault();
    const alfred = collections.find((c) => c.kind === 'alfred');
    const { agent, connectionString } = await createAgentOp(api, { name: '  Test laptop ', collectionIds: [alfred.id], canWrite: true }, SERVER);
    expect(agent).toMatchObject({ name: 'Test laptop', canWrite: true, collectionIds: [alfred.id], revokedAt: null });

    const body = api.calls.find((c) => c.method === 'POST' && c.url === '/agents').body;
    expect(Object.keys(body).sort()).toEqual(['canWrite', 'grants', 'id', 'name', 'token']);
    const parsed = parseConnectionString(connectionString);
    expect(parsed).toMatchObject({ server: SERVER, agentId: body.id, name: 'Test laptop' });
    expect(body.token).toBe(agentToken(parsed.deviceSecret));
    expect(JSON.stringify(body)).not.toContain(connectionString.slice(9));
    const key = openGrant(agentWrapKey(parsed.deviceSecret), body.grants[0].wrappedKey, body.id, alfred.id);
    expect(key).toEqual(getCollectionKey(alfred.id));

    const list = await listAgentsOp(api);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: body.id, collectionIds: [alfred.id] });
    const revoked = await revokeAgentOp(api, body.id);
    expect(revoked.revokedAt).toBeTruthy();
    expect((await revokeAgentOp(api, body.id)).revokedAt).toBe(revoked.revokedAt);
  });

  it('validates the name and collections before anything is sent', async () => {
    const { api, collections } = await freshVault();
    await expect(createAgentOp(api, { name: ' ', collectionIds: [collections[0].id] }, SERVER)).rejects.toThrow(/name/);
    await expect(createAgentOp(api, { name: 'x'.repeat(61), collectionIds: [collections[0].id] }, SERVER)).rejects.toThrow(/60/);
    await expect(createAgentOp(api, { name: 'Laptop', collectionIds: [] }, SERVER)).rejects.toThrow(/at least one collection/);
    expect(api.calls.some((c) => c.url === '/agents')).toBe(false);
  });

  it('getReads decrypts each row and keeps unreadable ones as field "unknown"', async () => {
    const { api, collections } = await freshVault();
    const alfred = collections.find((c) => c.kind === 'alfred');
    const item = await createItemOp(api, { ...blankItem('login'), title: 'Example', collectionId: alfred.id }, collections);
    const { agent } = await createAgentOp(api, { name: 'Test laptop', collectionIds: [alfred.id], canWrite: false }, SERVER);
    const good = uuidv4();
    const bad = uuidv4();
    api.db.reads.push(
      { id: good, itemId: item.id, agentId: agent.id, encrypted: sealRead(getCollectionKey(alfred.id), item.id, good, { field: 'Password', via: 'mcp', host: 'laptop' }), createdAt: '2026-01-02T00:00:00.000Z' },
      { id: bad, itemId: item.id, agentId: agent.id, encrypted: sealRead(getCollectionKey(alfred.id), item.id, good, { field: 'x', via: 'cli', host: 'h' }), createdAt: '2026-01-03T00:00:00.000Z' },
    );
    const reads = await getReadsOp(api, item);
    expect(reads).toEqual([
      { id: bad, createdAt: '2026-01-03T00:00:00.000Z', agentName: 'Test laptop', field: 'unknown', via: '', host: '' },
      { id: good, createdAt: '2026-01-02T00:00:00.000Z', agentName: 'Test laptop', field: 'Password', via: 'mcp', host: 'laptop' },
    ]);
  });
});
