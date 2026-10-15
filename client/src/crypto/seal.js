// AES-256-GCM seal/open in the "wv1.<nonce>.<ciphertext||tag>" format (spec §3).
import { gcm } from '@noble/ciphers/aes';
import { utf8, fromUtf8, toBase64, fromBase64, randomBytes } from './bytes.js';

export const SEAL_PREFIX = 'wv1';
const NONCE_LEN = 12;
const TAG_LEN = 16;

function checkKey(key) {
  if (!(key instanceof Uint8Array) || key.length !== 32) throw new Error('Key must be 32 bytes');
}

export function seal(key, plaintext, aad) {
  checkKey(key);
  if (!(plaintext instanceof Uint8Array)) throw new TypeError('seal expects plaintext bytes');
  if (typeof aad !== 'string') throw new TypeError('seal expects an AAD string');
  const nonce = randomBytes(NONCE_LEN);
  const ct = gcm(key, nonce, utf8(aad)).encrypt(plaintext);
  return `${SEAL_PREFIX}.${toBase64(nonce)}.${toBase64(ct)}`;
}

// Throws on any failure: bad format, wrong key, wrong AAD, tampered data.
export function open(key, sealed, aad) {
  checkKey(key);
  if (typeof sealed !== 'string') throw new Error('Sealed value is not a string');
  if (typeof aad !== 'string') throw new TypeError('open expects an AAD string');
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== SEAL_PREFIX) throw new Error('Unknown sealed format');
  const nonce = fromBase64(parts[1]);
  const ct = fromBase64(parts[2]);
  if (nonce.length !== NONCE_LEN || ct.length < TAG_LEN) throw new Error('Malformed sealed value');
  return gcm(key, nonce, utf8(aad)).decrypt(ct);
}

export const sealString = (key, str, aad) => seal(key, utf8(str), aad);
export const openString = (key, sealed, aad) => fromUtf8(open(key, sealed, aad));
export const sealJson = (key, value, aad) => sealString(key, JSON.stringify(value), aad);
export const openJson = (key, sealed, aad) => JSON.parse(openString(key, sealed, aad));
