// Master password -> keys (spec §3).
//   masterKey = Argon2id(password UTF-8, salt 16 B, m=65536 KiB, t=3, p=1, len 32)
//   encKey    = HKDF-SHA256(masterKey, salt empty, info "wreckvault/v2/enc",  32)
//   authKey   = HKDF-SHA256(masterKey, salt empty, info "wreckvault/v2/auth", 32)
//   authHash  = base64(authKey)
import { argon2id } from 'hash-wasm';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8, toBase64, fromBase64, randomBytes, zero } from './bytes.js';

export const DEFAULT_KDF_PARAMS = Object.freeze({ alg: 'argon2id', m: 65536, t: 3, p: 1 });
export const SALT_LEN = 16;
export const HKDF_INFO_ENC = 'wreckvault/v2/enc';
export const HKDF_INFO_AUTH = 'wreckvault/v2/auth';

// Server-supplied params are accepted only within these bounds, so a hostile or broken
// server cannot downgrade the KDF (or make the browser allocate gigabytes).
export function checkKdfParams(params) {
  const p = params || {};
  const ok = p.alg === 'argon2id'
    && Number.isInteger(p.m) && p.m >= DEFAULT_KDF_PARAMS.m && p.m <= 1048576
    && Number.isInteger(p.t) && p.t >= DEFAULT_KDF_PARAMS.t && p.t <= 20
    && Number.isInteger(p.p) && p.p >= 1 && p.p <= 16;
  if (!ok) throw new Error('The server sent key-derivation settings this app does not accept.');
  return { alg: 'argon2id', m: p.m, t: p.t, p: p.p };
}

export function newKdf() {
  return { salt: toBase64(randomBytes(SALT_LEN)), params: { ...DEFAULT_KDF_PARAMS } };
}

export async function deriveMasterKey(password, saltB64, params = DEFAULT_KDF_PARAMS) {
  const p = checkKdfParams(params);
  const salt = fromBase64(saltB64);
  if (salt.length !== SALT_LEN) throw new Error('Key-derivation salt must be 16 bytes.');
  const pw = utf8(password);
  try {
    return await argon2id({
      password: pw, salt, parallelism: p.p, iterations: p.t, memorySize: p.m,
      hashLength: 32, outputType: 'binary',
    });
  } finally {
    zero(pw);
  }
}

export function splitMasterKey(masterKey) {
  const empty = new Uint8Array(0);
  const encKey = hkdf(sha256, masterKey, empty, utf8(HKDF_INFO_ENC), 32);
  const authKey = hkdf(sha256, masterKey, empty, utf8(HKDF_INFO_AUTH), 32);
  return { encKey, authHash: toBase64(authKey), authKey };
}

// kdf = {salt, params}. Returns {encKey, authHash}; intermediate keys are zeroed.
export async function deriveKeys(password, kdf) {
  const masterKey = await deriveMasterKey(password, kdf?.salt, kdf?.params || DEFAULT_KDF_PARAMS);
  const { encKey, authHash, authKey } = splitMasterKey(masterKey);
  zero(masterKey);
  zero(authKey);
  return { encKey, authHash };
}
