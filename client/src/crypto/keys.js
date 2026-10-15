// Key-wrapping chain (spec §3): encKey -> vault key -> collection keys -> items.
import { seal, open, sealJson, openJson } from './seal.js';
import { randomBytes } from './bytes.js';

export const AAD_VAULT_KEY = 'wreckvault/v2/vault-key';
export const aadCollection = (collectionId) => `wreckvault/v2/collection:${collectionId}`;
export const aadItem = (itemId, type) => `wreckvault/v2/item:${itemId}:${type}`;

export const newKey = () => randomBytes(32);

function asKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('Unwrapped key has the wrong length');
  return bytes;
}

export const wrapVaultKey = (encKey, vaultKey) => seal(encKey, vaultKey, AAD_VAULT_KEY);
export const unwrapVaultKey = (encKey, wrapped) => asKey(open(encKey, wrapped, AAD_VAULT_KEY));

export const wrapCollectionKey = (vaultKey, collectionKey, collectionId) =>
  seal(vaultKey, collectionKey, aadCollection(collectionId));
export const unwrapCollectionKey = (vaultKey, wrapped, collectionId) =>
  asKey(open(vaultKey, wrapped, aadCollection(collectionId)));

export const sealItem = (collectionKey, itemId, type, payload) =>
  sealJson(collectionKey, payload, aadItem(itemId, type));
export const openItem = (collectionKey, itemId, type, encrypted) =>
  openJson(collectionKey, encrypted, aadItem(itemId, type));
