import { describe, it, expect } from 'vitest';
import { prepareUpgrade, verifyUpgrade } from './upgrade.js';
import { upgradeFlow, unlockFlow } from './sessionCore.js';
import { makeV1Rows, V1_PASSWORD } from './testData.js';
import { createFakeApi } from './fakeApi.js';
import { openItem, unwrapCollectionKey } from '../crypto/keys.js';
import { toBase64, fromBase64 } from '../crypto/bytes.js';

describe('upgrade', () => {
  it('maps every row once, seals into Personal, and verifies', async () => {
    const rows = makeV1Rows();
    const steps = new Set();
    const prep = await prepareUpgrade(rows, V1_PASSWORD, (p) => steps.add(p.step));
    expect(['decrypt', 'derive', 'encrypt', 'verify'].every((s) => steps.has(s))).toBe(true);
    const { body } = prep;
    expect(body.password).toBe(V1_PASSWORD);
    expect(body.kdf.params).toEqual({ alg: 'argon2id', m: 65536, t: 3, p: 1 });
    expect(body.collections.map((c) => c.kind)).toEqual(['personal', 'alfred']);
    expect(body.collections[1].agentAccess).toBe(true);
    const personal = body.collections[0];
    expect(body.items).toHaveLength(rows.length);
    expect(body.items.every((i) => i.collectionId === personal.id)).toBe(true);
    expect(body.items.map((i) => i.legacyEntryId)).toEqual(rows.map((r) => r.id));
    expect(prep.migrated).toBe(7);
    expect(prep.undecryptable).toBe(2);
    const pk = unwrapCollectionKey(prep.vaultKey, personal.wrappedKey, personal.id);
    const first = body.items[0];
    expect(openItem(pk, first.id, first.type, first.encrypted).title).toBe('GitHub');
    expect(first.createdAt).toBe(rows[0].createdAt);
    // nothing in the body is plaintext secret material except the password the spec requires
    expect(JSON.stringify(body.items)).not.toMatch(/hunter2|4111/);
  });

  it('verification catches a corrupted, swapped or missing item', async () => {
    const rows = makeV1Rows();
    const prep = await prepareUpgrade(rows, V1_PASSWORD);
    const base = {
      rows, expected: prep.expected, vaultKey: prep.vaultKey, collections: prep.body.collections,
    };
    expect(() => verifyUpgrade({ ...base, items: prep.body.items })).not.toThrow();

    // flip one ciphertext byte
    const corrupted = prep.body.items.map((i) => ({ ...i }));
    const parts = corrupted[2].encrypted.split('.');
    const ct = fromBase64(parts[2]);
    ct[3] ^= 0xff;
    corrupted[2].encrypted = `${parts[0]}.${parts[1]}.${toBase64(ct)}`;
    expect(() => verifyUpgrade({ ...base, items: corrupted })).toThrow(/entry 13/);

    // ciphertext of another item (opens to the wrong payload / wrong AAD)
    const swapped = prep.body.items.map((i) => ({ ...i }));
    swapped[0].encrypted = swapped[1].encrypted;
    expect(() => verifyUpgrade({ ...base, items: swapped })).toThrow(/Upgrade check failed/);

    // payload changed after sealing (deep-compare)
    const expected = new Map(prep.expected);
    expected.set(11, { ...expected.get(11), title: 'Changed' });
    expect(() => verifyUpgrade({ ...base, expected, items: prep.body.items })).toThrow(/entry 11/);

    expect(() => verifyUpgrade({ ...base, items: prep.body.items.slice(1) })).toThrow(/number of items/);
  });

  it('end to end against the fake server, then unlocks with the new keys', async () => {
    const rows = makeV1Rows();
    const api = createFakeApi({ v1Users: [{ id: 1, username: 'alice', password: V1_PASSWORD, rows }] });
    await api.post('/auth/login', { username: 'alice', password: V1_PASSWORD });
    const res = await upgradeFlow(api, V1_PASSWORD);
    expect(res.migrated).toBe(7);
    expect(res.undecryptable).toBe(2);
    expect(api.db.users[0].authVersion).toBe(2);
    expect(api.db.entries).toHaveLength(7); // v1 rows untouched
    expect(api.db.entries[0].encryptedBlob).toBe(rows[0].encryptedBlob);
    const { data } = await api.get('/auth/me');
    const vk = await unlockFlow(V1_PASSWORD, data.kdf, data.wrappedVaultKey);
    expect(vk).toEqual(res.vaultKey);
    await expect(unlockFlow('wrong', data.kdf, data.wrappedVaultKey)).rejects.toThrow(/Wrong master password/);
  });
});
