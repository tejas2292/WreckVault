// The only place unwrapped keys live: module-level memory. Never React state, never storage.
import { zero } from './bytes.js';

let vaultKey = null;
const collectionKeys = new Map();

export function setVaultKey(key) {
  if (vaultKey && vaultKey !== key) zero(vaultKey);
  vaultKey = key;
}

export const hasVaultKey = () => vaultKey !== null;

export function getVaultKey() {
  if (!vaultKey) throw new Error('The vault is locked. Unlock it and try again.');
  return vaultKey;
}

export function setCollectionKey(id, key) {
  const old = collectionKeys.get(id);
  if (old && old !== key) zero(old);
  collectionKeys.set(id, key);
}

export function getCollectionKey(id) {
  const k = collectionKeys.get(id);
  if (!k) throw new Error('The key for this collection is not available. Reload the vault and try again.');
  return k;
}

export const hasCollectionKey = (id) => collectionKeys.has(id);

export function clearKeys() {
  zero(vaultKey);
  vaultKey = null;
  for (const k of collectionKeys.values()) zero(k);
  collectionKeys.clear();
}
