import { describe, it, expect } from 'vitest';
import { totpCode, secondsLeft, base32Encode, base32Decode, hotp } from './totp.js';
import { utf8 } from '../crypto/bytes.js';

// RFC 6238 Appendix B, SHA-1 seed "12345678901234567890"
const SECRET = base32Encode(utf8('12345678901234567890'));

describe('totp', () => {
  it('base32 round-trips the RFC seed', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(Array.from(base32Decode(SECRET))).toEqual(Array.from(utf8('12345678901234567890')));
  });

  it('matches RFC 6238 SHA-1 vectors (8 digits, and truncated to 6)', () => {
    const key = base32Decode(SECRET);
    const cases = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
      [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
    for (const [t, code] of cases) {
      expect(hotp(key, Math.floor(t / 30), 8)).toBe(code);
      expect(totpCode(SECRET, t * 1000)).toBe(code.slice(-6));
    }
    expect(totpCode(SECRET, 59000)).toBe('287082');
    expect(totpCode(SECRET, 1111111109000)).toBe('081804');
    expect(totpCode(SECRET, 1234567890000)).toBe('005924');
  });

  it('accepts lowercase, spaces and otpauth:// URIs', () => {
    expect(totpCode(SECRET.toLowerCase().replace(/(.{4})/g, '$1 '), 59000)).toBe('287082');
    expect(totpCode(`otpauth://totp/Example:alice@example.com?secret=${SECRET}&issuer=Example`, 59000)).toBe('287082');
    expect(totpCode(`otpauth://totp/x?secret=${SECRET}&digits=8`, 59000)).toBe('94287082');
  });

  it('returns null for an unusable secret', () => {
    expect(totpCode('not base32!', 0)).toBeNull();
    expect(totpCode('', 0)).toBeNull();
  });

  it('secondsLeft counts down within the 30 s window', () => {
    expect(secondsLeft(0)).toBe(30);
    expect(secondsLeft(59000)).toBe(1);
    expect(secondsLeft(61000)).toBe(29);
  });
});
