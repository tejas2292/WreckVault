// Session state (spec §5): sign-in, lock/unlock, v1 -> v2 upgrade, account settings.
// Keys never enter React state; they live in crypto/keystore.js.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { errorMessage, onUnauthorized } from '../lib/api.js';
import { setVaultKey, setCollectionKey, clearKeys, getVaultKey } from '../crypto/keystore.js';
import { decryptLegacyRows, summarizeLegacy, buildLegacyBackup } from '../lib/legacy.js';
import { downloadJson, dateStamp } from '../lib/download.js';
import {
  QUIET, loginFlow, registerFlow, unlockFlow, changePasswordFlow, upgradeFlow, authHashFor,
} from '../lib/sessionCore.js';

const AUTOLOCK_KEY = 'wv-autolock';
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
const SESSION_EXPIRED = 'Your session expired. Sign in again.';

const SessionContext = createContext(null);

function readAutoLock() {
  try {
    const n = parseInt(window.localStorage.getItem(AUTOLOCK_KEY) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeAutoLock(n) {
  try { window.localStorage.setItem(AUTOLOCK_KEY, String(n)); } catch { /* storage unavailable */ }
}

// Sensitive values that must not sit in React state: the raw v1 password (needed only for
// the upgrade) and the decrypted legacy rows built from it.
const pending = { password: null, legacy: null, backupDownloaded: false };
function dropPending() {
  pending.password = null;
  pending.legacy = null;
  pending.backupDownloaded = false;
}

function installKeys(vaultKey, collectionKeys) {
  clearKeys();
  setVaultKey(vaultKey);
  for (const [id, key] of Object.entries(collectionKeys || {})) setCollectionKey(id, key);
}

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [error, setError] = useState(null);
  const [autoLockMinutes, setAutoLockState] = useState(readAutoLock);
  // Public (non-secret) material needed to unlock and change the password.
  const authRef = useRef({ kdf: null, wrappedVaultKey: null, authVersion: null });

  const toSignedOut = useCallback((message = null) => {
    clearKeys();
    dropPending();
    authRef.current = { kdf: null, wrappedVaultKey: null, authVersion: null };
    setUser(null);
    setStatus('signedOut');
    setError(message);
  }, []);

  const fail = useCallback((err, fallback) => {
    const message = errorMessage(err, fallback);
    setError(message);
    return { ok: false, error: message };
  }, []);

  // Boot: registration flag + existing cookie session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/status', QUIET);
        if (!cancelled) setRegistrationOpen(data?.registrationOpen === true);
      } catch { /* the sign-in screen still works without this */ }
      try {
        const { data } = await api.get('/auth/me', QUIET);
        if (cancelled) return;
        if (data.authVersion === 2) {
          authRef.current = { kdf: data.kdf, wrappedVaultKey: data.wrappedVaultKey, authVersion: 2 };
          setUser(data.user);
          setStatus('locked');
        } else {
          // v1: the upgrade needs the raw password, so the person signs in again.
          setStatus('signedOut');
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('signedOut');
        if (err?.response?.status !== 401) setError(errorMessage(err, 'Could not check your session.'));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // An expired cookie anywhere drops the keys and returns to sign-in.
  useEffect(() => onUnauthorized(() => toSignedOut(SESSION_EXPIRED)), [toSignedOut]);

  const login = useCallback(async (username, password) => {
    setError(null);
    try {
      const res = await loginFlow(api, username, password);
      clearKeys();
      dropPending();
      if (res.authVersion === 1) {
        try {
          const { data: rows } = await api.get('/legacy/entries');
          pending.legacy = decryptLegacyRows(rows || [], password);
        } catch (err) {
          await api.post('/auth/logout', {}, QUIET).catch(() => {});
          return fail(err, 'Signed in, but your saved entries could not be loaded. Try again.');
        }
        pending.password = password;
        authRef.current = { kdf: null, wrappedVaultKey: null, authVersion: 1 };
        setUser(res.user);
        setStatus('needsUpgrade');
        return { ok: true };
      }
      setVaultKey(res.vaultKey);
      authRef.current = { kdf: res.kdf, wrappedVaultKey: res.wrappedVaultKey, authVersion: 2 };
      setUser(res.user);
      setStatus('unlocked');
      return { ok: true };
    } catch (err) {
      return fail(err, 'Sign-in failed. Try again.');
    }
  }, [fail]);

  const register = useCallback(async (username, password) => {
    setError(null);
    try {
      const res = await registerFlow(api, username, password);
      dropPending();
      installKeys(res.vaultKey, res.collectionKeys);
      authRef.current = { kdf: res.kdf, wrappedVaultKey: res.wrappedVaultKey, authVersion: 2 };
      setUser(res.user);
      setStatus('unlocked');
      return { ok: true };
    } catch (err) {
      return fail(err, 'Could not create the account. Try again.');
    }
  }, [fail]);

  const unlock = useCallback(async (password) => {
    setError(null);
    try {
      // Fetch fresh: the password may have been changed on another device.
      const { data } = await api.get('/auth/me', QUIET);
      if (data.authVersion !== 2) {
        toSignedOut('Sign in again to upgrade your vault.');
        return { ok: false, error: 'Sign in again to upgrade your vault.' };
      }
      authRef.current = { kdf: data.kdf, wrappedVaultKey: data.wrappedVaultKey, authVersion: 2 };
      setUser(data.user);
      const vaultKey = await unlockFlow(password, data.kdf, data.wrappedVaultKey);
      clearKeys();
      setVaultKey(vaultKey);
      setStatus('unlocked');
      return { ok: true };
    } catch (err) {
      if (err?.response?.status === 401) {
        toSignedOut(SESSION_EXPIRED);
        return { ok: false, error: SESSION_EXPIRED };
      }
      return fail(err, 'Could not unlock the vault. Try again.');
    }
  }, [fail, toSignedOut]);

  const lock = useCallback(() => {
    clearKeys();
    if (authRef.current.authVersion === 2) {
      setError(null);
      setStatus('locked');
    } else {
      toSignedOut();
    }
  }, [toSignedOut]);

  const logout = useCallback(async () => {
    clearKeys();
    try { await api.post('/auth/logout', {}, QUIET); } catch { /* cookie expires on its own */ }
    toSignedOut();
  }, [toSignedOut]);

  const legacySummary = useCallback(() => summarizeLegacy(pending.legacy || []), []);

  const downloadUpgradeBackup = useCallback(() => {
    if (!pending.legacy) throw new Error('Sign in again to download the backup.');
    const filename = `wreckvault-backup-before-upgrade-${dateStamp()}.json`;
    downloadJson(filename, buildLegacyBackup(pending.legacy));
    pending.backupDownloaded = true;
    return filename;
  }, []);

  const runUpgrade = useCallback(async (onProgress) => {
    setError(null);
    if (!pending.password) {
      const message = 'Sign in again to upgrade your vault.';
      setError(message);
      return { ok: false, migrated: 0, undecryptable: 0, error: message };
    }
    if (!pending.backupDownloaded) {
      const message = 'Download the backup before upgrading.';
      setError(message);
      return { ok: false, migrated: 0, undecryptable: 0, error: message };
    }
    try {
      const res = await upgradeFlow(api, pending.password, onProgress || (() => {}));
      dropPending();
      installKeys(res.vaultKey, res.collectionKeys);
      authRef.current = { kdf: res.kdf, wrappedVaultKey: res.wrappedVaultKey, authVersion: 2 };
      setUser(res.user);
      setStatus('unlocked');
      return { ok: true, migrated: res.migrated, undecryptable: res.undecryptable };
    } catch (err) {
      const r = fail(err, 'The upgrade failed. Your vault was not changed. Try again.');
      return { ...r, migrated: 0, undecryptable: 0 };
    }
  }, [fail]);

  const changeMasterPassword = useCallback(async (current, next) => {
    setError(null);
    try {
      if (!next) throw new Error('Enter a new master password.');
      const { data } = await api.get('/auth/me', QUIET);
      const res = await changePasswordFlow(api, {
        current, next, kdf: data.kdf, wrappedVaultKey: data.wrappedVaultKey, vaultKey: getVaultKey(),
      });
      authRef.current = { ...authRef.current, kdf: res.kdf, wrappedVaultKey: res.wrappedVaultKey };
      return { ok: true };
    } catch (err) {
      return fail(err, 'Could not change the master password. Nothing was changed.');
    }
  }, [fail]);

  const deleteAccount = useCallback(async (password) => {
    setError(null);
    try {
      let body;
      if (authRef.current.authVersion === 2) {
        const { data } = await api.get('/auth/me', QUIET);
        body = { authHash: await authHashFor(password, data.kdf) };
      } else {
        body = { password };
      }
      await api.delete('/auth/me', { data: body, ...QUIET });
      toSignedOut();
      return { ok: true };
    } catch (err) {
      return fail(err, 'Could not delete the account. Try again.');
    }
  }, [fail, toSignedOut]);

  const updateProfileImage = useCallback(async (dataUrlOrNull) => {
    try {
      const { data } = await api.put('/auth/me', { profileImage: dataUrlOrNull ?? null });
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      return fail(err, 'Could not update the profile image. Try again.');
    }
  }, [fail]);

  const loginHistory = useCallback(async (limit = 100) => {
    const { data } = await api.get('/auth/login-logs', { params: { limit } });
    return data || [];
  }, []);

  const setAutoLockMinutes = useCallback((n) => {
    const v = Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0;
    writeAutoLock(v);
    setAutoLockState(v);
  }, []);

  // Inactivity auto-lock while unlocked.
  useEffect(() => {
    if (status !== 'unlocked' || !autoLockMinutes) return undefined;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => lock(), autoLockMinutes * 60 * 1000);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [status, autoLockMinutes, lock]);

  const value = useMemo(() => ({
    status, user, registrationOpen, error,
    login, register, unlock, lock, logout,
    legacySummary, downloadUpgradeBackup, runUpgrade,
    changeMasterPassword, deleteAccount, updateProfileImage, loginHistory,
    autoLockMinutes, setAutoLockMinutes,
  }), [status, user, registrationOpen, error, login, register, unlock, lock, logout,
    legacySummary, downloadUpgradeBackup, runUpgrade, changeMasterPassword, deleteAccount,
    updateProfileImage, loginHistory, autoLockMinutes, setAutoLockMinutes]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>.');
  return ctx;
}
