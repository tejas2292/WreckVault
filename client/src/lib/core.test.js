import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeApi } from './fakeApi.js';
import { registerFlow, loginFlow, changePasswordFlow, unlockFlow } from './sessionCore.js';
import {
  loadVault, createItemOp, updateItemOp, trashItemOp, restoreItemOp, deleteForeverOp, getHistoryOp, createCollectionOp,
} from './vaultCore.js';
import { blankItem } from './itemModel.js';
import { clearKeys, setVaultKey, setCollectionKey } from '../crypto/keystore.js';

const PW = 'correct horse battery staple';

async function freshVault() {
  clearKeys();
  const api = createFakeApi();
  const reg = await registerFlow(api, 'alice', PW);
  setVaultKey(reg.vaultKey);
  for (const [id, k] of Object.entries(reg.collectionKeys)) setCollectionKey(id, k);
  const v = await loadVault(api);
  return { api, reg, ...v };
}

describe('session flows', () => {
  beforeEach(() => clearKeys());

  it('register creates the default collections and a v2 user; login unwraps the same vault key', async () => {
    const api = createFakeApi();
    const reg = await registerFlow(api, 'alice', PW);
    const body = api.calls.find((c) => c.url === '/auth/register').body;
    expect(body).not.toHaveProperty('password');
    expect(body.collections.map((c) => [c.name, c.kind, c.agentAccess])).toEqual([['Personal', 'personal', false], ['ALFRED', 'alfred', true]]);
    await api.post('/auth/logout');
    const res = await loginFlow(api, 'alice', PW);
    expect(res.authVersion).toBe(2);
    expect(res.vaultKey).toEqual(reg.vaultKey);
    await expect(loginFlow(api, 'alice', 'wrong password')).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('v1 users get authVersion 1 from login (password sent, no key derivation)', async () => {
    const api = createFakeApi({ v1Users: [{ id: 1, username: 'bob', password: PW, rows: [] }] });
    const res = await loginFlow(api, 'bob', PW);
    expect(res.authVersion).toBe(1);
    expect(api.calls.find((c) => c.url === '/auth/login').body).toEqual({ username: 'bob', password: PW });
  });

  it('change password re-wraps the SAME vault key under a new salt', async () => {
    const api = createFakeApi();
    const reg = await registerFlow(api, 'alice', PW);
    const before = (await api.get('/auth/me')).data;
    await expect(changePasswordFlow(api, { current: 'nope', next: 'new one', kdf: before.kdf, wrappedVaultKey: before.wrappedVaultKey, vaultKey: reg.vaultKey }))
      .rejects.toThrow(/current master password is wrong/);
    await changePasswordFlow(api, { current: PW, next: 'a new master password', kdf: before.kdf, wrappedVaultKey: before.wrappedVaultKey, vaultKey: reg.vaultKey });
    const after = (await api.get('/auth/me')).data;
    expect(after.kdf.salt).not.toBe(before.kdf.salt);
    expect(await unlockFlow('a new master password', after.kdf, after.wrappedVaultKey)).toEqual(reg.vaultKey);
    await expect(unlockFlow(PW, after.kdf, after.wrappedVaultKey)).rejects.toThrow(/Wrong master password/);
  });
});

describe('vault operations', () => {
  it('create, update (type + collection move), favourite, trash, restore, delete forever', async () => {
    const { api, collections } = await freshVault();
    const [personal, alfred] = collections;
    const draft = { ...blankItem('login'), title: 'Example site' };
    draft.fields[1].value = 'pw-1';
    const created = await createItemOp(api, draft, collections);
    expect(created.collectionId).toBe(personal.id);
    expect(api.db.items[0].encrypted.startsWith('wv1.')).toBe(true);
    expect(api.db.items[0].encrypted).not.toMatch(/pw-1/);

    const moved = await updateItemOp(api, created, { type: 'api_key', collectionId: alfred.id, title: 'Renamed' });
    expect(moved).toMatchObject({ type: 'api_key', collectionId: alfred.id, title: 'Renamed' });
    const fav = await updateItemOp(api, moved, { favorite: true });
    expect(fav.favorite).toBe(true);

    const reloaded = await loadVault(api);
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.items[0]).toMatchObject({ title: 'Renamed', type: 'api_key', collectionId: alfred.id, favorite: true });
    expect(reloaded.items[0].decryptError).toBeUndefined();

    await expect(deleteForeverOp(api, fav.id)).rejects.toMatchObject({ response: { status: 409 } });
    const trashed = await trashItemOp(api, fav);
    expect(trashed.deletedAt).toBeTruthy();
    const restored = await restoreItemOp(api, trashed);
    expect(restored.deletedAt).toBeNull();
    await trashItemOp(api, restored);
    await deleteForeverOp(api, fav.id);
    expect((await loadVault(api)).items).toHaveLength(0);
  });

  it('history opens each version with its own type/collection; restore saves it as an update', async () => {
    const { api, collections } = await freshVault();
    const v1 = await createItemOp(api, { ...blankItem('wifi'), title: 'Home Wi-Fi' }, collections);
    const v2 = await updateItemOp(api, v1, { type: 'secure_note', title: 'Now a note', collectionId: collections[1].id });
    const history = await getHistoryOp(api, v2);
    expect(history).toHaveLength(1);
    expect(history[0].item).toMatchObject({ type: 'wifi', title: 'Home Wi-Fi', collectionId: collections[0].id });
    const back = await updateItemOp(api, v2, (({ id, createdAt, updatedAt, deletedAt, legacyEntryId, ...d }) => d)(history[0].item)); // eslint-disable-line no-unused-vars
    expect(back).toMatchObject({ type: 'wifi', title: 'Home Wi-Fi', collectionId: collections[0].id });
    expect(await getHistoryOp(api, back)).toHaveLength(2);
  });

  it('an item that fails to open is listed as unreadable, never dropped, and cannot be edited', async () => {
    const { api, collections } = await freshVault();
    await createItemOp(api, { ...blankItem('login'), title: 'Good' }, collections);
    const bad = await createItemOp(api, { ...blankItem('login'), title: 'Bad' }, collections);
    api.db.items.find((i) => i.id === bad.id).type = 'card'; // AAD no longer matches
    const { items } = await loadVault(api);
    expect(items).toHaveLength(2);
    const unreadable = items.find((i) => i.id === bad.id);
    expect(unreadable).toMatchObject({ decryptError: true, title: 'Unreadable item' });
    await expect(updateItemOp(api, unreadable, { title: 'x' })).rejects.toThrow(/could not be decrypted/);
  });

  it('validates drafts and creates custom collections', async () => {
    const { api, collections } = await freshVault();
    await expect(createItemOp(api, { type: 'nope', title: 'x' }, collections)).rejects.toThrow(/item type/);
    await expect(createItemOp(api, { type: 'login', title: '  ' }, collections)).rejects.toThrow(/title/);
    const big = { name: 'big.bin', data: 'A'.repeat(1.5 * 1024 * 1024) };
    await expect(createItemOp(api, { type: 'login', title: 'x', attachments: [big] }, collections)).rejects.toThrow(/larger than 1 MB/);
    const c = await createCollectionOp(api, 'Work');
    expect(c).toMatchObject({ name: 'Work', kind: 'custom', agentAccess: false });
    const item = await createItemOp(api, { type: 'login', title: 'In work', collectionId: c.id }, collections);
    expect((await loadVault(api)).items.find((i) => i.id === item.id).collectionId).toBe(c.id);
  });
});
