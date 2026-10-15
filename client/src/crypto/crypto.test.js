import { describe, it, expect } from 'vitest';
import {
  toBase64, fromBase64, utf8, fromUtf8, uuidv4, UUID_RE, randomBytes, shortId,
} from './bytes.js';
import { seal, open, sealJson, openJson } from './seal.js';
import { deriveMasterKey, splitMasterKey, deriveKeys, newKdf, checkKdfParams, DEFAULT_KDF_PARAMS } from './kdf.js';
import {
  newKey, wrapVaultKey, unwrapVaultKey, wrapCollectionKey, unwrapCollectionKey, sealItem, openItem,
  AAD_VAULT_KEY, aadCollection, aadItem,
} from './keys.js';
import { setVaultKey, getVaultKey, setCollectionKey, getCollectionKey, clearKeys, hasVaultKey } from './keystore.js';

describe('bytes', () => {
  it('base64 matches RFC 4648 vectors', () => {
    const vec = { '': '', f: 'Zg==', fo: 'Zm8=', foo: 'Zm9v', foob: 'Zm9vYg==', fooba: 'Zm9vYmE=', foobar: 'Zm9vYmFy' };
    for (const [plain, b64] of Object.entries(vec)) {
      expect(toBase64(utf8(plain))).toBe(b64);
      expect(fromUtf8(fromBase64(b64))).toBe(plain);
    }
  });
  it('base64 round-trips random binary and rejects garbage', () => {
    const b = randomBytes(1000);
    expect(fromBase64(toBase64(b))).toEqual(b);
    expect(() => fromBase64('abc')).toThrow();
    expect(() => fromBase64('ab!d')).toThrow();
    expect(() => fromBase64('a=bc')).toThrow();
  });
  it('uuidv4 has the v4 shape and is unique', () => {
    const ids = new Set(Array.from({ length: 200 }, uuidv4));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_RE);
    expect(shortId()).toMatch(/^[0-9a-z]{10}$/);
  });
});

describe('seal / open', () => {
  const key = newKey();
  const aad = 'wreckvault/v2/item:x:login';

  it('round-trips and uses the wv1.<nonce>.<ct> format', () => {
    const s = seal(key, utf8('hello'), aad);
    const parts = s.split('.');
    expect(parts[0]).toBe('wv1');
    expect(fromBase64(parts[1]).length).toBe(12);
    expect(fromBase64(parts[2]).length).toBe(5 + 16);
    expect(fromUtf8(open(key, s, aad))).toBe('hello');
    expect(openJson(key, sealJson(key, { a: [1, 'b'] }, aad), aad)).toEqual({ a: [1, 'b'] });
  });

  it('uses a fresh nonce every time', () => {
    expect(seal(key, utf8('x'), aad)).not.toBe(seal(key, utf8('x'), aad));
  });

  it('detects tampering with the ciphertext, tag or nonce', () => {
    const s = seal(key, utf8('secret value'), aad);
    const [p, n, c] = s.split('.');
    const ct = fromBase64(c);
    for (const idx of [0, ct.length - 1]) {
      const t = ct.slice();
      t[idx] ^= 1;
      expect(() => open(key, `${p}.${n}.${toBase64(t)}`, aad)).toThrow();
    }
    const nonce = fromBase64(n);
    nonce[0] ^= 1;
    expect(() => open(key, `${p}.${toBase64(nonce)}.${c}`, aad)).toThrow();
    expect(() => open(key, `wv2.${n}.${c}`, aad)).toThrow();
    expect(() => open(key, `${p}.${n}`, aad)).toThrow();
  });

  it('fails with the wrong AAD or the wrong key', () => {
    const s = seal(key, utf8('v'), aad);
    expect(() => open(key, s, 'wreckvault/v2/item:x:card')).toThrow();
    expect(() => open(newKey(), s, aad)).toThrow();
  });

  it('opens a ciphertext produced by an independent AES-GCM implementation', () => {
    // Python `cryptography` AESGCM, key = 32 x 0x01, nonce = 12 x 0x02, aad "aad", plaintext "hello"
    const k = new Uint8Array(32).fill(1);
    const sealed = `wv1.${toBase64(new Uint8Array(12).fill(2))}.${FIXED_CT}`;
    expect(fromUtf8(open(k, sealed, 'aad'))).toBe('hello');
  });
});

// Pinned once; the master key was cross-checked against the reference `argon2` CLI
// (argon2 SALT -id -t 3 -m 16 -p 1 -l 32) and the HKDF outputs against Python's hmac.
const KDF_VECTOR = {
  password: 'correct horse battery staple',
  salt: 'd3JlY2t2YXVsdC1zYWx0IQ==', // "wreckvault-salt!"
  masterKey: 'tb8ymZlUBdlKA9Lh83EXv9UCjKfDni8aBA4/65lEl+Y=',
  encKey: '01N4VXM3TIfA/upDOqpPiBo98dBXFVGFufPuvMozIos=',
  authHash: 'lKi+k5QRvn4WY9GRrT/riA401TG/Hb5VLSalfIqP5oM=',
};

describe('kdf', () => {
  it('matches the pinned Argon2id + HKDF vector', async () => {
    const mk = await deriveMasterKey(KDF_VECTOR.password, KDF_VECTOR.salt, DEFAULT_KDF_PARAMS);
    expect(toBase64(mk)).toBe(KDF_VECTOR.masterKey);
    const { encKey, authHash } = splitMasterKey(mk);
    expect(toBase64(encKey)).toBe(KDF_VECTOR.encKey);
    expect(authHash).toBe(KDF_VECTOR.authHash);
  });

  it('deriveKeys is deterministic and password/salt sensitive', async () => {
    const kdf = { salt: KDF_VECTOR.salt, params: { ...DEFAULT_KDF_PARAMS } };
    const a = await deriveKeys(KDF_VECTOR.password, kdf);
    expect(toBase64(a.encKey)).toBe(KDF_VECTOR.encKey);
    expect(a.authHash).toBe(KDF_VECTOR.authHash);
    const b = await deriveKeys('correct horse battery stapl', kdf);
    expect(b.authHash).not.toBe(KDF_VECTOR.authHash);
    const c = await deriveKeys(KDF_VECTOR.password, newKdf());
    expect(c.authHash).not.toBe(KDF_VECTOR.authHash);
  });

  it('newKdf gives a 16-byte salt and the spec params; weak params are refused', () => {
    const k = newKdf();
    expect(fromBase64(k.salt).length).toBe(16);
    expect(k.params).toEqual({ alg: 'argon2id', m: 65536, t: 3, p: 1 });
    expect(() => checkKdfParams({ alg: 'argon2id', m: 1024, t: 3, p: 1 })).toThrow();
    expect(() => checkKdfParams({ alg: 'pbkdf2', m: 65536, t: 3, p: 1 })).toThrow();
  });
});

describe('key wrapping chain', () => {
  it('encKey -> vault key -> collection key -> item, with AAD binding', () => {
    expect(AAD_VAULT_KEY).toBe('wreckvault/v2/vault-key');
    expect(aadCollection('c1')).toBe('wreckvault/v2/collection:c1');
    expect(aadItem('i1', 'login')).toBe('wreckvault/v2/item:i1:login');

    const encKey = newKey();
    const vaultKey = newKey();
    const wrapped = wrapVaultKey(encKey, vaultKey);
    expect(unwrapVaultKey(encKey, wrapped)).toEqual(vaultKey);
    expect(() => unwrapVaultKey(newKey(), wrapped)).toThrow();

    const cid = uuidv4();
    const collKey = newKey();
    const wk = wrapCollectionKey(vaultKey, collKey, cid);
    expect(unwrapCollectionKey(vaultKey, wk, cid)).toEqual(collKey);
    expect(() => unwrapCollectionKey(vaultKey, wk, uuidv4())).toThrow();
    // A collection key can't be passed off as the vault key (different AAD).
    expect(() => unwrapVaultKey(vaultKey, wk)).toThrow();

    const iid = uuidv4();
    const payload = { v: 1, title: 'Example', fields: [] };
    const enc = sealItem(collKey, iid, 'login', payload);
    expect(openItem(collKey, iid, 'login', enc)).toEqual(payload);
    expect(() => openItem(collKey, iid, 'card', enc)).toThrow();
    expect(() => openItem(collKey, uuidv4(), 'login', enc)).toThrow();
  });

  it('keystore drops and zeroes keys on clear', () => {
    const vk = newKey();
    const ck = newKey();
    setVaultKey(vk);
    setCollectionKey('c', ck);
    expect(getVaultKey()).toBe(vk);
    expect(getCollectionKey('c')).toBe(ck);
    clearKeys();
    expect(hasVaultKey()).toBe(false);
    expect(() => getVaultKey()).toThrow();
    expect(() => getCollectionKey('c')).toThrow();
    expect(vk.every((b) => b === 0)).toBe(true);
    expect(ck.every((b) => b === 0)).toBe(true);
  });
});

const FIXED_CT = 'b7OlJSX9+Woq23J8H1d+Gox8bbTS';
