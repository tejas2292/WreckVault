// v1 -> v2 upgrade (spec §4): build the request body, then verify every sealed item
// by opening it again and deep-comparing with the payload it was built from.
import { DEFAULT_COLLECTIONS } from './itemTypes.js';
import { uuidv4, bytesEqual, zero } from '../crypto/bytes.js';
import { newKdf, deriveKeys } from '../crypto/kdf.js';
import {
  newKey, wrapVaultKey, unwrapVaultKey, wrapCollectionKey, unwrapCollectionKey, sealItem, openItem,
} from '../crypto/keys.js';
import { decryptLegacyRows, mapLegacyRow } from './legacy.js';
import { deepEqual } from './itemModel.js';

// Fresh vault key + the default collections, each with its own key. Used by register and upgrade.
export function createVaultKeys() {
  const vaultKey = newKey();
  const collectionKeys = {};
  const collections = DEFAULT_COLLECTIONS.map((c) => {
    const id = uuidv4();
    const key = newKey();
    collectionKeys[id] = key;
    return { id, name: c.name, kind: c.kind, agentAccess: c.agentAccess, wrappedKey: wrapCollectionKey(vaultKey, key, id) };
  });
  return { vaultKey, collections, collectionKeys };
}

// Throws (with a message naming the problem) unless every item opens back to its payload.
export function verifyUpgrade({ rows, items, expected, vaultKey, encKey, wrappedVaultKey, collections }) {
  if (encKey && wrappedVaultKey) {
    const check = unwrapVaultKey(encKey, wrappedVaultKey);
    const same = bytesEqual(check, vaultKey);
    zero(check);
    if (!same) throw new Error('Upgrade check failed: the vault key did not unwrap correctly.');
  }
  const keys = {};
  for (const c of collections) keys[c.id] = unwrapCollectionKey(vaultKey, c.wrappedKey, c.id);

  const rowIds = rows.map((r) => r.id);
  const itemIds = items.map((i) => i.legacyEntryId);
  if (items.length !== rows.length || new Set(itemIds).size !== items.length
    || !rowIds.every((id) => itemIds.includes(id))) {
    throw new Error('Upgrade check failed: the number of items does not match your saved entries.');
  }
  for (const item of items) {
    const want = expected.get(item.legacyEntryId);
    let got;
    try {
      got = openItem(keys[item.collectionId], item.id, item.type, item.encrypted);
    } catch {
      got = undefined;
    }
    if (!want || !deepEqual(got, want)) {
      throw new Error(`Upgrade check failed for entry ${item.legacyEntryId}. Nothing was changed; try again.`);
    }
  }
  for (const k of Object.values(keys)) zero(k);
}

// rows = GET /legacy/entries. Returns {body, vaultKey, collectionKeys, encKey, migrated, undecryptable}.
// `body` is ready for POST /auth/upgrade.
export async function prepareUpgrade(rows, password, onProgress = () => {}) {
  const total = rows.length;
  onProgress({ step: 'decrypt', done: 0, total });
  const decrypted = decryptLegacyRows(rows, password);

  onProgress({ step: 'derive', done: 0, total });
  const kdf = newKdf();
  const { encKey, authHash } = await deriveKeys(password, kdf);
  const { vaultKey, collections, collectionKeys } = createVaultKeys();
  const wrappedVaultKey = wrapVaultKey(encKey, vaultKey);
  const personal = collections.find((c) => c.kind === 'personal');
  const personalKey = collectionKeys[personal.id];

  const items = [];
  const expected = new Map();
  let undecryptable = 0;
  decrypted.forEach(({ row, dec }, i) => {
    const m = mapLegacyRow(row, dec);
    if (m.undecryptable) undecryptable += 1;
    const id = uuidv4();
    expected.set(row.id, m.payload);
    items.push({
      id,
      collectionId: personal.id,
      type: m.type,
      encrypted: sealItem(personalKey, id, m.type, m.payload),
      legacyEntryId: row.id,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    });
    onProgress({ step: 'encrypt', done: i + 1, total });
  });

  onProgress({ step: 'verify', done: 0, total });
  verifyUpgrade({ rows, items, expected, vaultKey, encKey, wrappedVaultKey, collections });
  onProgress({ step: 'verify', done: total, total });

  return {
    body: { password, authHash, kdf, wrappedVaultKey, collections, items },
    vaultKey,
    encKey,
    collectionKeys,
    expected,
    migrated: items.length,
    undecryptable,
  };
}
