// RFC 6238 TOTP (default SHA-1, 30 s, 6 digits) from a base32 secret or an otpauth:// URI.
import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/sha1';
import { sha256 } from '@noble/hashes/sha256';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!clean) throw new Error('Empty secret');
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('The one-time code secret is not valid base32.');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes) {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// -> {secret, digits, period, algorithm}
export function parseTotp(secretOrUri) {
  const raw = String(secretOrUri || '').trim();
  let secret = raw;
  let digits = 6;
  let period = 30;
  let algorithm = 'SHA1';
  if (/^otpauth:\/\//i.test(raw)) {
    const q = raw.indexOf('?');
    const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
    secret = params.get('secret') || '';
    const d = parseInt(params.get('digits') || '', 10);
    if (d >= 6 && d <= 8) digits = d;
    const p = parseInt(params.get('period') || '', 10);
    if (p > 0 && p <= 300) period = p;
    const a = (params.get('algorithm') || '').toUpperCase();
    if (a === 'SHA256') algorithm = 'SHA256';
  }
  return { secret: base32Decode(secret), digits, period, algorithm };
}

export function hotp(key, counter, digits = 6, algorithm = 'SHA1') {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c % 256;
    c = Math.floor(c / 256);
  }
  const mac = hmac(algorithm === 'SHA256' ? sha256 : sha1, key, msg);
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// Returns the current code, or null when the secret is not usable.
export function totpCode(secretOrUri, now = Date.now()) {
  try {
    const { secret, digits, period, algorithm } = parseTotp(secretOrUri);
    return hotp(secret, Math.floor(now / 1000 / period), digits, algorithm);
  } catch {
    return null;
  }
}

export function secondsLeft(now = Date.now(), period = 30) {
  return period - (Math.floor(now / 1000) % period);
}
