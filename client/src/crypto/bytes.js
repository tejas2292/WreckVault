// Byte helpers: UTF-8, base64 (standard alphabet, with padding), random bytes, UUID v4.
// Works in a non-secure browser context (plain HTTP on the LAN): only
// crypto.getRandomValues is used, never crypto.subtle or crypto.randomUUID.

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

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('This browser cannot generate secure random numbers.');
  }
  return c;
}

export function randomBytes(n) {
  const out = new Uint8Array(n);
  const c = getCrypto();
  for (let i = 0; i < n; i += 65536) c.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
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

// Short random id for fields and attachments (10 chars, base36).
export function shortId(len = 10) {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += (b[i] % 36).toString(36);
  return s;
}

export function zero(bytes) {
  if (bytes instanceof Uint8Array) bytes.fill(0);
}

export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
