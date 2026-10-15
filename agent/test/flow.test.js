// Full CLI flow against the in-process fake §8.3 server.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/commands.js';
import { makeFixture, startFakeServer } from './fakeServer.js';
import { configFile, cacheFile } from '../src/paths.js';
import { hotp, base32Decode } from '../src/totp.js';
import { WvError } from '../src/errors.js';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

function capture(isTTY = false) {
  let buf = '';
  return { write: (s) => { buf += s; return true; }, isTTY, get text() { return buf; }, clear() { buf = ''; } };
}

async function wv(argv, { tty = false, now = NOW } = {}) {
  const stdout = capture(tty);
  const stderr = capture();
  let code;
  try {
    code = await run(argv, { stdout, stderr, vaultOpts: { now: () => now, host: 'test-host' } });
  } catch (e) {
    if (!(e instanceof WvError)) throw e;
    stderr.write(e.message);
    code = e.exitCode;
  }
  return { code, out: stdout.text, err: stderr.text };
}

let home;
const oldHome = process.env.HOME;
beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-flow-'));
  process.env.HOME = home;
  delete process.env.WV_CONNECTION;
});
afterAll(() => {
  process.env.HOME = oldHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('wv against a fake server', () => {
  const fx = makeFixture({ canWrite: true });
  let srv;
  beforeAll(async () => { srv = await startFakeServer(fx); });
  afterAll(async () => { await srv.stop(); });

  it('reports not logged in with exit 3', async () => {
    const r = await wv(['ls']);
    expect(r.code).toBe(3);
  });

  it('rejects a bad connection string', async () => {
    const r = await wv(['login', 'wvagent1:garbage']);
    expect(r.code).toBe(1);
  });

  it('login verifies and saves config 0600', async () => {
    const r = await wv(['login', fx.connection(srv.url)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Test laptop');
    expect(r.out).toContain('read and write');
    const st = fs.statSync(configFile());
    expect(st.mode & 0o777).toBe(0o600);
    expect(fs.statSync(cacheFile()).mode & 0o777).toBe(0o600);
    const cfg = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    expect(cfg.connection).toBe(fx.connection(srv.url));
    // cache holds ciphertext only
    expect(fs.readFileSync(cacheFile(), 'utf8')).not.toContain('correct horse');
  });

  it('login via the hidden prompt', async () => {
    const stdout = capture();
    const code = await run(['login'], { stdout, stderr: capture(), readHidden: async () => fx.connection(srv.url), vaultOpts: { now: () => NOW } });
    expect(code).toBe(0);
  });

  it('ls lists granted, non-trashed items only', async () => {
    const r = await wv(['ls']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Staging DB');
    expect(r.out).toContain('GitHub bot token');
    expect(r.out).not.toContain('Trashed thing');
    expect(r.out).not.toContain('Bank');
    expect(r.out).not.toContain('correct horse');
    const j = JSON.parse((await wv(['ls', 'staging', '--json'])).out);
    expect(j.map((x) => x.title).sort()).toEqual(['Staging DB', 'Staging DB (old)']);
    expect(j.find((x) => x.title === 'Staging DB').fields.find((f) => f.label === 'Password').value).toBe('[secret]');
    const t = JSON.parse((await wv(['ls', '--type', 'api_key', '--json'])).out);
    expect(t.map((x) => x.title)).toEqual(['GitHub bot token']);
    const p = JSON.parse((await wv(['ls', '--project', 'demo', '--json'])).out);
    expect(p.map((x) => x.title)).toEqual(['Staging DB']);
  });

  it('get prints the raw value with no trailing newline and logs a read', async () => {
    const before = fx.reads.length;
    const r = await wv(['get', 'Staging DB']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('correct horse battery staple');
    expect(fx.reads.length).toBe(before + 1);
    expect(fx.decryptRead(fx.reads.at(-1))).toEqual({ field: 'Password', via: 'cli', host: 'test-host' });
    const tty = await wv(['get', 'staging db', 'host'], { tty: true });
    expect(tty.out).toBe('10.0.0.5\n');
    expect(fx.decryptRead(fx.reads.at(-1)).field).toBe('Host');
  });

  it('get resolves substrings, rejects ambiguity, prints TOTP codes', async () => {
    expect((await wv(['get', 'bot'])).out).toBe('ghp_exampleexampleexample');
    const amb = await wv(['get', 'git']);
    expect(amb.code).toBe(2);
    expect(amb.err).toContain('GitHub bot token');
    expect((await wv(['get', 'nothing-here'])).code).toBe(2);
    expect((await wv(['get', 'GitHub', 'nope'])).code).toBe(2);
    const code = hotp(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), Math.floor(NOW / 30000));
    expect((await wv(['get', 'GitHub', 'one-time code'])).out).toBe(code);
    expect((await wv(['get', 'GitHub', 'one-time code', '--raw'])).out).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('show masks secrets unless --reveal (which logs "*")', async () => {
    const before = fx.reads.length;
    const r = await wv(['show', 'GitHub']);
    expect(r.out).toContain('alice');
    expect(r.out).not.toContain('gh-pass-123');
    expect(r.out).not.toContain('GEZDG');
    expect(fx.reads.length).toBe(before);
    const rv = await wv(['show', 'GitHub', '--reveal']);
    expect(rv.out).toContain('gh-pass-123');
    expect(fx.reads.length).toBe(before + 1);
    expect(fx.decryptRead(fx.reads.at(-1)).field).toBe('*');
  });

  it('offline: uses the cache and queues reads; back online: flushes the queue', async () => {
    await srv.stop();
    const before = fx.reads.length;
    const r = await wv(['get', 'Staging DB'], { now: NOW + 5 * 60000 });
    expect(r.code).toBe(0);
    expect(r.out).toBe('correct horse battery staple');
    expect(r.err).toMatch(/offline, cached \d+[smhd] ago/);
    const cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    expect(cache.pendingReads).toHaveLength(1);
    const st = await wv(['status']);
    expect(st.out).toContain('offline');
    expect(st.out).toContain('1 read(s) waiting');
    const w = await wv(['get', 'GitHub']);
    expect(w.code).toBe(0);
    expect(JSON.parse(fs.readFileSync(cacheFile(), 'utf8')).pendingReads).toHaveLength(2);
    // writes need the server
    const { Vault } = await import('../src/vault.js');
    const ov = await Vault.fromConfig({ warn: () => {} }).load();
    expect(ov.offline).toBe(true);
    await expect(ov.put({ type: 'login', title: 'x', fields: [] })).rejects.toMatchObject({ exitCode: 4 });
    expect(fx.reads.length).toBe(before);

    await srv.restart();
    const ls = await wv(['ls']);
    expect(ls.code).toBe(0);
    expect(ls.err).not.toContain('offline');
    expect(fx.reads.length).toBe(before + 2);
    expect(fx.decryptRead(fx.reads.at(-2))).toEqual({ field: 'Password', via: 'cli', host: 'test-host' });
    expect(JSON.parse(fs.readFileSync(cacheFile(), 'utf8')).pendingReads).toHaveLength(0);
  });

  it('server down and no cache → exit 4', async () => {
    const fx2 = makeFixture();
    process.env.WV_CONNECTION = fx2.connection('http://127.0.0.1:9');
    try {
      const r = await wv(['ls']);
      expect(r.code).toBe(4);
      expect(r.err).toContain('Cannot reach');
    } finally {
      delete process.env.WV_CONNECTION;
    }
  });

  it('put and update when canWrite (unknown keys preserved)', async () => {
    const { Vault } = await import('../src/vault.js');
    const v = await Vault.fromConfig({ warn: () => {} }).load();
    const r = await v.put({ type: 'api_key', title: 'New key', fields: [{ label: 'Key', kind: 'secret', value: 's3cret' }], project: 'DEMO', tags: ['x'] });
    expect(r.collection).toBe('ALFRED');
    const created = fx.items.find((i) => i.id === r.id);
    expect(created.collectionId).toBe(fx.alfred.id);
    expect(fx.decryptItem(r.id)).toMatchObject({ v: 1, title: 'New key', project: 'DEMO', status: 'active', fields: [{ label: 'Key', kind: 'secret', value: 's3cret' }] });
    const inOps = await v.put({ type: 'login', title: 'Ops login', fields: [], collection: 'ops' });
    expect(fx.items.find((i) => i.id === inOps.id).collectionId).toBe(fx.ops.id);
    await expect(v.put({ type: 'bogus', title: 'x', fields: [] })).rejects.toThrow(/Unknown item type/);
    await expect(v.put({ type: 'login', title: 'x', fields: [{ label: 'a', kind: 'nope', value: '' }] })).rejects.toThrow(/Unknown field kind/);

    const u = await v.update('Staging DB', { setFields: [{ label: 'password', value: 'rotated' }], status: 'active', tags: ['db', 'rotated'] });
    expect(u.id).toBe(fx.ids.stagingDb);
    const p = fx.decryptItem(fx.ids.stagingDb);
    expect(p.customKey).toEqual({ keep: true });
    expect(p.fields.find((f) => f.label === 'Password')).toEqual({ id: 'f3', label: 'Password', kind: 'secret', value: 'rotated' });
    expect(p.fields.find((f) => f.label === 'Host').value).toBe('10.0.0.5');
    expect(p.tags).toEqual(['db', 'rotated']);
    expect((await wv(['get', 'Staging DB'])).out).toBe('rotated');
  });

  it('read-only device: 403 from the server is surfaced', async () => {
    fx.agent.canWrite = false;
    const { Vault } = await import('../src/vault.js');
    const v = await Vault.fromConfig({ warn: () => {} }).load();
    expect(v.status().permission).toBe('read only');
    await expect(v.put({ type: 'login', title: 'x', fields: [] })).rejects.toThrow(/read-only access/);
    await expect(v.update('GitHub', { notes: 'x' })).rejects.toMatchObject({ status: 403 });
    fx.agent.canWrite = true;
  });

  it('logout deletes config and cache', async () => {
    expect((await wv(['logout'])).code).toBe(0);
    expect(fs.existsSync(configFile())).toBe(false);
    expect(fs.existsSync(cacheFile())).toBe(false);
    expect((await wv(['status'])).code).toBe(3);
  });
});
