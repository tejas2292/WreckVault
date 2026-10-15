// Session flows without React (sign in, register, unlock, change password, upgrade).
// Each takes the axios-like `api`. Requests where a 401 is an expected answer skip the
// global "session expired" handler.
import { deriveKeys, newKdf } from '../crypto/kdf.js';
import { wrapVaultKey, unwrapVaultKey } from '../crypto/keys.js';
import { zero, bytesEqual } from '../crypto/bytes.js';
import { createVaultKeys, prepareUpgrade } from './upgrade.js';

export const QUIET = { skipAuthHandler: true };
export const WRONG_PASSWORD = 'Wrong master password. Check it and try again.';

export function unwrapWithPassword(encKey, wrappedVaultKey) {
  try {
    return unwrapVaultKey(encKey, wrappedVaultKey);
  } catch {
    throw new Error(WRONG_PASSWORD);
  }
}

// -> {authVersion:1, user} | {authVersion:2, user, kdf, wrappedVaultKey, vaultKey}
export async function loginFlow(api, username, password, onStage = () => {}) {
  const { data: pre } = await api.post('/auth/prelogin', { username }, QUIET);
  if (pre.authVersion === 1) {
    onStage('signingIn');
    const { data } = await api.post('/auth/login', { username, password }, QUIET);
    return { authVersion: 1, user: data.user };
  }
  onStage('deriving');
  const { encKey, authHash } = await deriveKeys(password, pre.kdf);
  try {
    onStage('signingIn');
    const { data } = await api.post('/auth/login', { username, authHash }, QUIET);
    const vaultKey = unwrapWithPassword(encKey, data.wrappedVaultKey);
    return { authVersion: 2, user: data.user, kdf: data.kdf, wrappedVaultKey: data.wrappedVaultKey, vaultKey };
  } finally {
    zero(encKey);
  }
}

export async function registerFlow(api, username, password, onStage = () => {}) {
  onStage('deriving');
  const kdf = newKdf();
  const { encKey, authHash } = await deriveKeys(password, kdf);
  const { vaultKey, collections, collectionKeys } = createVaultKeys();
  const wrappedVaultKey = wrapVaultKey(encKey, vaultKey);
  zero(encKey);
  onStage('signingIn');
  const { data } = await api.post('/auth/register', { username, authHash, kdf, wrappedVaultKey, collections }, QUIET);
  return { user: data.user, kdf: data.kdf || kdf, wrappedVaultKey: data.wrappedVaultKey || wrappedVaultKey, vaultKey, collectionKeys };
}

export async function unlockFlow(password, kdf, wrappedVaultKey) {
  const { encKey } = await deriveKeys(password, kdf);
  try {
    return unwrapWithPassword(encKey, wrappedVaultKey);
  } finally {
    zero(encKey);
  }
}

// Re-wraps the SAME vault key under a new salt. -> {kdf, wrappedVaultKey}
export async function changePasswordFlow(api, { current, next, kdf, wrappedVaultKey, vaultKey }) {
  const cur = await deriveKeys(current, kdf);
  let check;
  try {
    check = unwrapWithPassword(cur.encKey, wrappedVaultKey);
  } catch {
    zero(cur.encKey);
    throw new Error('The current master password is wrong.');
  }
  const matches = bytesEqual(check, vaultKey);
  zero(check);
  zero(cur.encKey);
  if (!matches) throw new Error('The vault key on the server does not match this session. Lock, unlock and try again.');

  const newKdfValue = newKdf();
  const nxt = await deriveKeys(next, newKdfValue);
  const newWrapped = wrapVaultKey(nxt.encKey, vaultKey);
  const roundTrip = unwrapVaultKey(nxt.encKey, newWrapped);
  const ok = bytesEqual(roundTrip, vaultKey);
  zero(roundTrip);
  zero(nxt.encKey);
  if (!ok) throw new Error('Could not re-encrypt the vault key. Nothing was changed.');

  await api.post('/auth/change-password', {
    currentAuthHash: cur.authHash, newAuthHash: nxt.authHash, kdf: newKdfValue, wrappedVaultKey: newWrapped,
  }, QUIET);
  return { kdf: newKdfValue, wrappedVaultKey: newWrapped };
}

// Full upgrade: fetch rows fresh, build + verify, POST. -> {user, kdf, wrappedVaultKey, vaultKey, collectionKeys, migrated, undecryptable}
export async function upgradeFlow(api, password, onProgress = () => {}) {
  onProgress({ step: 'fetch', done: 0, total: 0 });
  const { data: rows } = await api.get('/legacy/entries');
  const prep = await prepareUpgrade(rows || [], password, onProgress);
  zero(prep.encKey);
  onProgress({ step: 'upload', done: 0, total: prep.migrated });
  try {
    const { data } = await api.post('/auth/upgrade', prep.body, QUIET);
    onProgress({ step: 'done', done: prep.migrated, total: prep.migrated });
    return {
      user: data.user, kdf: data.kdf || prep.body.kdf, wrappedVaultKey: data.wrappedVaultKey || prep.body.wrappedVaultKey,
      vaultKey: prep.vaultKey, collectionKeys: prep.collectionKeys,
      migrated: data.migrated ?? prep.migrated, undecryptable: prep.undecryptable,
    };
  } catch (err) {
    zero(prep.vaultKey);
    for (const k of Object.values(prep.collectionKeys)) zero(k);
    throw err;
  }
}

export async function authHashFor(password, kdf) {
  const { encKey, authHash } = await deriveKeys(password, kdf);
  zero(encKey);
  return authHash;
}
