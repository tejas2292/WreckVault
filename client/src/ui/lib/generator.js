// Password and JWT-secret generators, ported from the v1 generator page.
// Randomness comes from crypto.getRandomValues, which works on plain-HTTP LAN origins too.

export const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};

export const DEFAULT_PASSWORD_OPTIONS = {
  length: 12,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

export const JWT_LENGTH_MIN = 8;
export const JWT_LENGTH_MAX = 512;
export const JWT_LENGTH_STEP = 8;
export const JWT_LENGTH_DEFAULT = 128;

// Unbiased integer in [0, max).
function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

const pick = (str) => str[randomInt(str.length)];

export function generatePassword(options = {}) {
  const { length = 16, uppercase = true, lowercase = true, numbers = true, symbols = true } = options;
  let charset = '';
  const required = [];
  if (uppercase) { charset += CHARSETS.uppercase; required.push(CHARSETS.uppercase); }
  if (lowercase) { charset += CHARSETS.lowercase; required.push(CHARSETS.lowercase); }
  if (numbers) { charset += CHARSETS.numbers; required.push(CHARSETS.numbers); }
  if (symbols) { charset += CHARSETS.symbols; required.push(CHARSETS.symbols); }
  if (!charset) return '';

  // At least one character from each selected set, then fill and shuffle (Fisher-Yates).
  const out = required.map(pick);
  while (out.length < length) out.push(pick(charset));
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

// Byte length chosen so the base64url output has bits/4 characters, exactly as v1 did.
export function jwtByteLength(bits) {
  return Math.max(1, Math.ceil(((bits / 4) * 6) / 8));
}

export function generateJwtSecret(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Masked preview used while "Show full secret" is off (same rule as v1).
export function maskSecret(secret) {
  if (!secret) return '';
  const len = secret.length;
  if (len < 4) return '*'.repeat(len);
  if (len <= 12) return secret.slice(0, 2) + '*'.repeat(len - 4) + secret.slice(-2);
  return secret.slice(0, 6) + '*'.repeat(len - 12) + secret.slice(-6);
}

// Default for the Generate button on secret fields in the item editor.
export function quickSecret() {
  return generatePassword({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true });
}

export function shortId(len = 8) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += abc[randomInt(abc.length)];
  return s;
}
