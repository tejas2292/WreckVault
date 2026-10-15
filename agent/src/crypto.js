// Self-contained port of client/src/crypto (bytes.js, seal.js, keys.js) plus the agent
// derivations of spec §8.1. Logic is kept identical to the web client.
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { webcrypto } from 'node:crypto';

// ---- bytes -------------------------------------------------------------------------
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

export const utf8 = (str) => encoder.encode(String(str));
export const fromUtf8 = (bytes) => strictDecoder.decode(bytes);

export function toBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('toBase64 expects a Uint8Array');
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }
  return out;
}

// Strict decoder: rejects anything that is not canonical padded base64.
export function fromBase64(str) {
  if (typeof str !== 'string' || str.length % 4 !== 0) throw new Error('Invalid base64');
  let pad = 0;
  if (str.endsWith('==')) pad = 2;
  else if (str.endsWith('=')) pad = 1;
  const out = new Uint8Array((str.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < str.length; i += 4) {
    const last = i + 4 === str.length;
    const c = [0, 1, 2, 3].map((k) => {
      const ch = str.charCodeAt(i + k);
      if (last && ch === 61 /* = */ && k >= 4 - pad) return 0;
      const v = ch < 128 ? LOOKUP[ch] : -1;
      if (v < 0) throw new Error('Invalid base64');
      return v;
    });
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// base64url = RFC 4648 §5 without padding (spec §8.1).
export const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) {
    throw new Error('Invalid base64url');
  }
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

export function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) webcrypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

// RFC 4122 version 4 UUID built from getRandomValues.
export function uuidv4() {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Short random id for fields and attachments (base36).
export function shortId(len = 10) {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += (b[i] % 36).toString(36);
  return s;
}

export const toHex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');

// ---- seal / open (spec §3) ---------------------------------------------------------
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

// ---- AADs and key chain ------------------------------------------------------------
export const aadItem = (itemId, type) => `wreckvault/v2/item:${itemId}:${type}`;
export const aadAgentGrant = (agentId, collectionId) => `wreckvault/v2/agent-grant:${agentId}:${collectionId}`;
export const aadRead = (itemId, readId) => `wreckvault/v2/read:${itemId}:${readId}`;

export const HKDF_INFO_AGENT_AUTH = 'wreckvault/v2/agent-auth';
export const HKDF_INFO_AGENT_WRAP = 'wreckvault/v2/agent-wrap';

const hkdf32 = (ikm, info) => hkdf(sha256, ikm, new Uint8Array(0), utf8(info), 32);

// deviceSecret (32 bytes) -> {agentToken (base64url string), agentWrapKey (32 bytes)}
export function deriveAgentKeys(deviceSecret) {
  if (!(deviceSecret instanceof Uint8Array) || deviceSecret.length !== 32) {
    throw new Error('The device secret must be 32 bytes.');
  }
  return {
    agentToken: toBase64Url(hkdf32(deviceSecret, HKDF_INFO_AGENT_AUTH)),
    agentWrapKey: hkdf32(deviceSecret, HKDF_INFO_AGENT_WRAP),
  };
}

function asKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('Unwrapped key has the wrong length');
  return bytes;
}

export const wrapGrantKey = (agentWrapKey, collectionKey, agentId, collectionId) =>
  seal(agentWrapKey, collectionKey, aadAgentGrant(agentId, collectionId));
export const unwrapGrantKey = (agentWrapKey, wrapped, agentId, collectionId) =>
  asKey(open(agentWrapKey, wrapped, aadAgentGrant(agentId, collectionId)));

export const sealItem = (collectionKey, itemId, type, payload) =>
  sealJson(collectionKey, payload, aadItem(itemId, type));
export const openItem = (collectionKey, itemId, type, encrypted) =>
  openJson(collectionKey, encrypted, aadItem(itemId, type));

export const sealRead = (collectionKey, itemId, readId, entry) =>
  sealJson(collectionKey, entry, aadRead(itemId, readId));
export const openRead = (collectionKey, itemId, readId, encrypted) =>
  openJson(collectionKey, encrypted, aadRead(itemId, readId));
