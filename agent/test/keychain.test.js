// macOS only: the saved login keeps the device secret in the Keychain, not in the file.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const mac = process.platform === 'darwin';

describe.skipIf(!mac)('macOS Keychain secret store', () => {
  let home, prev;
  const agentId = '7d3f1c2e-9a4b-4c5d-8e6f-0123456789ab';
  const secret = Buffer.alloc(32, 7);
  beforeAll(() => {
    // Keep the real HOME: macOS finds the login Keychain through it. Only the config file moves.
    prev = { WV_SECRET_STORE: process.env.WV_SECRET_STORE };
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'wvkc-'));
    process.env.WV_CONFIG_FILE = path.join(home, 'agent.json');
    delete process.env.WV_SECRET_STORE;
  });
  afterAll(() => {
    spawnSync('security', ['delete-generic-password', '-s', 'wreckvault-agent', '-a', agentId]);
    delete process.env.WV_CONFIG_FILE;
    if (prev.WV_SECRET_STORE === undefined) delete process.env.WV_SECRET_STORE; else process.env.WV_SECRET_STORE = prev.WV_SECRET_STORE;
  });

  it('saves to the Keychain, loads it back, and deletes both on logout', async () => {
    const { saveConnection, loadConnection, deleteConnection } = await import('../src/config.js');
    const file = saveConnection({ server: 'https://vault.example.com', agentId, name: 'Test device', secret });
    const onDisk = fs.readFileSync(file, 'utf8');
    expect(JSON.parse(onDisk)).toMatchObject({ v: 2, store: 'keychain', agentId });
    expect(onDisk).not.toContain(secret.toString('base64url'));
    const kc = spawnSync('security', ['find-generic-password', '-s', 'wreckvault-agent', '-a', agentId, '-w'], { encoding: 'utf8' });
    expect(kc.stdout.trim()).toBe(secret.toString('base64url'));
    const loaded = loadConnection();
    expect(Buffer.from(loaded.secret).equals(secret)).toBe(true);
    expect(loaded.server).toBe('https://vault.example.com');
    deleteConnection();
    expect(fs.existsSync(file)).toBe(false);
    const gone = spawnSync('security', ['find-generic-password', '-s', 'wreckvault-agent', '-a', agentId, '-w']);
    expect(gone.status).not.toBe(0);
  });
});
