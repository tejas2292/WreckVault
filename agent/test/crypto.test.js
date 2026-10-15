import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeCrypto from 'node:crypto';
import {
  deriveAgentKeys, seal, open, sealItem, openItem, aadItem, toBase64, fromBase64, toBase64Url, fromBase64Url,
  wrapGrantKey, unwrapGrantKey, sealRead, openRead, randomBytes, uuidv4, UUID_RE, toHex, utf8,
} from '../src/crypto.js';
import { parseConnection, formatConnection } from '../src/connection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const VECTORS = path.resolve(here, '../../client/src/crypto/agent.vectors.json');
const seq32 = Uint8Array.from({ length: 32 }, (_, i) => i);

const nodeHkdf = (ikm, info) => new Uint8Array(nodeCrypto.hkdfSync('sha256', ikm, Buffer.alloc(0), Buffer.from(info), 32));

describe('agent key derivation (§8.1)', () => {
  it('matches an independent node:crypto hkdfSync computation', () => {
    for (const secret of [seq32, randomBytes(32)]) {
      const { agentToken, agentWrapKey } = deriveAgentKeys(secret);
      const auth = Buffer.from(nodeHkdf(secret, 'wreckvault/v2/agent-auth'));
      expect(agentToken).toBe(auth.toString('base64url'));
      expect(agentToken).not.toMatch(/[=+/]/);
      expect(toHex(agentWrapKey)).toBe(Buffer.from(nodeHkdf(secret, 'wreckvault/v2/agent-wrap')).toString('hex'));
    }
  });

  it('matches the pinned web-client vectors when present', () => {
    const v = JSON.parse(fs.readFileSync(VECTORS, 'utf8'));
    const secret = Uint8Array.from(Buffer.from(v.deviceSecretHex, 'hex'));
    expect(toHex(secret)).toBe(toHex(seq32));
    if (v.deviceSecretBase64Url) expect(toBase64Url(secret)).toBe(v.deviceSecretBase64Url);
    const { agentToken, agentWrapKey } = deriveAgentKeys(secret);
    expect(agentToken).toBe(v.agentToken);
    expect(toHex(agentWrapKey)).toBe(v.agentWrapKeyHex ?? v.agentWrapKey);
  });
});

describe('base64 / base64url', () => {
  it('round-trips all lengths and matches Buffer', () => {
    for (let n = 0; n < 40; n++) {
      const b = randomBytes(n);
      expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
      expect(toBase64Url(b)).toBe(Buffer.from(b).toString('base64url'));
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
      expect(Array.from(fromBase64Url(toBase64Url(b)))).toEqual(Array.from(b));
    }
    expect(() => fromBase64('abc')).toThrow();
    expect(() => fromBase64Url('ab+c')).toThrow();
  });
  it('uuidv4 is valid', () => { expect(uuidv4()).toMatch(UUID_RE); });
});

describe('seal / open interop with node:crypto aes-256-gcm', () => {
  const key = randomBytes(32);
  const id = uuidv4();
  const aad = aadItem(id, 'login');
  const payload = { v: 1, title: 'GitHub', fields: [{ id: 'f1', label: 'Password', kind: 'secret', value: 'pässwörd' }] };

  it('our seal opens with node:crypto', () => {
    const sealed = sealItem(key, id, 'login', payload);
    const [pfx, n, c] = sealed.split('.');
    expect(pfx).toBe('wv1');
    const nonce = Buffer.from(n, 'base64');
    const ct = Buffer.from(c, 'base64');
    expect(nonce.length).toBe(12);
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, nonce);
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(ct.subarray(ct.length - 16));
    const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    expect(JSON.parse(pt.toString('utf8'))).toEqual(payload);
  });

  it('node:crypto output opens with our open', () => {
    const nonce = nodeCrypto.randomBytes(12);
    const c = nodeCrypto.createCipheriv('aes-256-gcm', key, nonce);
    c.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(payload))), c.final(), c.getAuthTag()]);
    const sealed = `wv1.${nonce.toString('base64')}.${ct.toString('base64')}`;
    expect(openItem(key, id, 'login', sealed)).toEqual(payload);
    expect(() => openItem(key, id, 'api_key', sealed)).toThrow();
    expect(() => open(randomBytes(32), sealed, aad)).toThrow();
  });

  it('grant and read AADs bind the ids', () => {
    const wrap = randomBytes(32);
    const agentId = uuidv4();
    const cid = uuidv4();
    const ck = randomBytes(32);
    const w = wrapGrantKey(wrap, ck, agentId, cid);
    expect(toHex(unwrapGrantKey(wrap, w, agentId, cid))).toBe(toHex(ck));
    expect(toHex(open(wrap, w, `wreckvault/v2/agent-grant:${agentId}:${cid}`))).toBe(toHex(ck));
    expect(() => unwrapGrantKey(wrap, w, agentId, uuidv4())).toThrow();
    const rid = uuidv4();
    const r = sealRead(ck, id, rid, { field: 'Password', via: 'cli', host: 'box' });
    expect(openRead(ck, id, rid, r)).toEqual({ field: 'Password', via: 'cli', host: 'box' });
    expect(JSON.parse(Buffer.from(open(ck, r, `wreckvault/v2/read:${id}:${rid}`)).toString())).toEqual({ field: 'Password', via: 'cli', host: 'box' });
    expect(() => open(ck, seal(ck, utf8('x'), 'a'), 'b')).toThrow();
  });
});

describe('connection string', () => {
  it('round-trips and matches the spec encoding', () => {
    const conn = { server: 'http://10.0.0.5:3011', agentId: uuidv4(), name: 'MacBook Air', secret: seq32 };
    const s = formatConnection(conn);
    expect(s.startsWith('wvagent1:')).toBe(true);
    const json = JSON.parse(Buffer.from(s.slice(9), 'base64url').toString('utf8'));
    expect(json).toEqual({ v: 1, server: conn.server, agentId: conn.agentId, name: 'MacBook Air', secret: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' });
    const p = parseConnection(`  ${s}\n`);
    expect(p.server).toBe(conn.server);
    expect(toHex(p.secret)).toBe(toHex(seq32));
    expect(() => parseConnection('wvagent1:nope')).toThrow(/not a valid/);
    expect(() => parseConnection('hello')).toThrow(/wvagent1/);
  });
});
