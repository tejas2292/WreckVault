import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { passesGate, literalsFromText, candidateLiterals, digest } from '../src/guardHashes.js';

describe('guard hash list', () => {
  it('applies the entropy gate like the ALFRED guard', () => {
    expect(passesGate('Zq8-example-Token-91')).toBe(true);
    expect(passesGate('sunshine12')).toBe(false);          // no uppercase / symbol
    expect(passesGate('10.0.0.43')).toBe(false);
    expect(passesGate('2026-10-16T10:00')).toBe(false);
    expect(passesGate('has a space 9X')).toBe(false);
    expect(passesGate('alice@example.com')).toBe(false);
    expect(passesGate('GLIDE-DEV-10x9A')).toBe(false);
  });
  it('lifts values from secret-labelled table rows only', () => {
    const t = '| Host | `10.0.0.43` |\n| Password | `Example-Pass-77Q` |\n| Used for | `Deploy-Key-55Z` |\nprose `Not-In-Table-1A`';
    expect(literalsFromText(t)).toEqual(['Example-Pass-77Q']);
  });
  it('collects from secret fields and long-text fields, gated', () => {
    const items = [{ fields: [
      { kind: 'secret', value: 'tok_Example_123' },
      { kind: 'secret', value: 'short' },
      { kind: 'mono', value: 'Plain-Value-123' },
      { kind: 'multi', value: '| API key | `Key-From-Table-9Z` |' },
    ] }];
    expect(candidateLiterals(items).sort()).toEqual(['Key-From-Table-9Z', 'tok_Example_123']);
  });
  it('digest is keyed HMAC-SHA256 truncated to 128 bits', () => {
    const key = Buffer.alloc(32, 1);
    expect(digest(key, 'abc')).toBe(crypto.createHmac('sha256', key).update('abc').digest('hex').slice(0, 32));
  });
});

describe('prefix pre-filter', () => {
  it('is a keyed digest of the first 4 characters', async () => {
    const { prefixDigest, digest } = await import('../src/guardHashes.js');
    const key = Buffer.alloc(32, 2);
    expect(prefixDigest(key, 'Abcd-rest-123')).toBe(digest(key, 'prefix:Abcd'));
  });
});
