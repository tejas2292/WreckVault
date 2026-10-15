/* eslint-env node */
import { describe, it, expect } from 'vitest';
import { hkdfSync } from 'node:crypto';
import vectors from './agent.vectors.json';
import {
  toBase64Url, fromBase64Url, createDeviceCredentials, agentToken, agentWrapKey, wrapGrant, openGrant,
  buildConnectionString, parseConnectionString, sealRead, openRead, aadAgentGrant, aadRead,
} from './agent.js';
import { open } from './seal.js';
import { newKey } from './keys.js';
import { UUID_RE, randomBytes, utf8 } from './bytes.js';

const hex = (b) => Buffer.from(b).toString('hex');
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);
const ID = '11111111-2222-4333-8444-555555555555';
const COLL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('base64url', () => {
  it('matches RFC 4648 §5 without padding and round-trips', () => {
    expect(toBase64Url(utf8('f'))).toBe('Zg');
    expect(toBase64Url(utf8('fo'))).toBe('Zm8');
    expect(toBase64Url(utf8('foo'))).toBe('Zm9v');
    expect(toBase64Url(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe('-_-_');
    for (let n = 0; n < 40; n++) {
      const b = randomBytes(n);
      expect(toBase64Url(b)).toBe(Buffer.from(b).toString('base64url'));
      expect(fromBase64Url(toBase64Url(b))).toEqual(b);
    }
    expect(() => fromBase64Url('Zg==')).toThrow();
    expect(() => fromBase64Url('a+b/')).toThrow();
    expect(() => fromBase64Url('abcde')).toThrow();
  });
});

describe('agent keys (pinned vectors)', () => {
  it('the vectors file describes deviceSecret = bytes 0..31', () => {
    expect(vectors.deviceSecretHex).toBe(hex(SECRET));
    expect(vectors.deviceSecretBase64Url).toBe(toBase64Url(SECRET));
  });

  it('agentToken and agentWrapKey match the pinned values', () => {
    expect(agentToken(SECRET)).toBe(vectors.agentToken);
    expect(hex(agentWrapKey(SECRET))).toBe(vectors.agentWrapKeyHex);
  });

  it('the pinned values agree with node:crypto hkdfSync', () => {
    const empty = Buffer.alloc(0);
    const auth = Buffer.from(hkdfSync('sha256', Buffer.from(SECRET), empty, 'wreckvault/v2/agent-auth', 32));
    const wrap = Buffer.from(hkdfSync('sha256', Buffer.from(SECRET), empty, 'wreckvault/v2/agent-wrap', 32));
    expect(auth.toString('base64url')).toBe(vectors.agentToken);
    expect(wrap.toString('hex')).toBe(vectors.agentWrapKeyHex);
  });

  it('createDeviceCredentials gives a v4 UUID and 32 random bytes', () => {
    const a = createDeviceCredentials();
    const b = createDeviceCredentials();
    expect(a.agentId).toMatch(UUID_RE);
    expect(a.deviceSecret).toHaveLength(32);
    expect(hex(a.deviceSecret)).not.toBe(hex(b.deviceSecret));
    expect(() => agentToken(new Uint8Array(16))).toThrow();
  });
});

describe('grants and reads', () => {
  it('wrapGrant opens with the same wrap key and AAD, and fails on any other', () => {
    const wrapKey = agentWrapKey(SECRET);
    const collKey = newKey();
    const sealed = wrapGrant(wrapKey, collKey, ID, COLL);
    expect(sealed.startsWith('wv1.')).toBe(true);
    expect(openGrant(wrapKey, sealed, ID, COLL)).toEqual(collKey);
    expect(open(wrapKey, sealed, `wreckvault/v2/agent-grant:${ID}:${COLL}`)).toEqual(collKey);
    expect(aadAgentGrant(ID, COLL)).toBe(`wreckvault/v2/agent-grant:${ID}:${COLL}`);
    expect(() => openGrant(wrapKey, sealed, ID, ID)).toThrow();
    expect(() => openGrant(agentWrapKey(randomBytes(32)), sealed, ID, COLL)).toThrow();
  });

  it('sealRead / openRead round-trip {field, via, host} and bind item and read ids', () => {
    const key = newKey();
    const readId = '99999999-8888-4777-8666-555555555555';
    const sealed = sealRead(key, ID, readId, { field: 'Password', via: 'cli', host: 'laptop.example.com', extra: 'dropped' });
    expect(openRead(key, ID, readId, sealed)).toEqual({ field: 'Password', via: 'cli', host: 'laptop.example.com' });
    expect(aadRead(ID, readId)).toBe(`wreckvault/v2/read:${ID}:${readId}`);
    expect(() => openRead(key, ID, ID, sealed)).toThrow();
    expect(() => openRead(key, readId, readId, sealed)).toThrow();
    expect(() => openRead(newKey(), ID, readId, sealed)).toThrow();
  });
});

describe('connection string', () => {
  it('has the wvagent1 prefix and round-trips', () => {
    const s = buildConnectionString({ server: 'http://10.0.0.5:3011', agentId: ID, name: 'Test laptop', deviceSecret: SECRET });
    expect(s.startsWith('wvagent1:')).toBe(true);
    expect(s).not.toMatch(/[=+/]/);
    const json = JSON.parse(Buffer.from(s.slice(9), 'base64url').toString('utf8'));
    expect(json).toEqual({ v: 1, server: 'http://10.0.0.5:3011', agentId: ID, name: 'Test laptop', secret: vectors.deviceSecretBase64Url });
    const parsed = parseConnectionString(`  ${s}\n`);
    expect(parsed).toMatchObject({ v: 1, server: 'http://10.0.0.5:3011', agentId: ID, name: 'Test laptop' });
    expect(parsed.deviceSecret).toEqual(SECRET);
  });

  it('rejects other strings', () => {
    expect(() => parseConnectionString('hello')).toThrow(/not a WreckVault connection string/);
    expect(() => parseConnectionString('wvagent1:!!!')).toThrow(/damaged/);
    const bad = 'wvagent1:' + toBase64Url(utf8(JSON.stringify({ v: 1, server: 'x', agentId: ID, name: 'n', secret: 'AAAA' })));
    expect(() => parseConnectionString(bad)).toThrow(/damaged/);
  });
});
