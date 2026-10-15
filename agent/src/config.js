// Saved login (spec §8.5). The device secret never sits in the file on macOS or Windows:
//   macOS   {v:2, server, agentId, name, store:'keychain'}; secret in the login Keychain
//           (service "wreckvault-agent", account = agentId), written via `security -i` over stdin.
//   Windows {v:1, server, agentId, name, secretDpapi}; DPAPI (CurrentUser) via PowerShell over stdin.
//   Linux   {v:1, connection} in a 0600 file.
// WV_SECRET_STORE=file forces the plain-file form (tests, CI).
import { spawnSync } from 'node:child_process';
import { configFile } from './paths.js';
import { readJson, writePrivateJson, removeFile } from './files.js';
import { parseConnection, formatConnection } from './connection.js';
import { toBase64, fromBase64 } from './crypto.js';
import { WvError, EXIT } from './errors.js';

const PS_PREFIX = 'Add-Type -AssemblyName System.Security; '
  + '$b = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); ';

function dpapi(op, bytes) {
  const script = PS_PREFIX
    + `$r = [System.Security.Cryptography.ProtectedData]::${op}($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); `
    + '[Console]::Out.Write([Convert]::ToBase64String($r))';
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: toBase64(bytes), encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  if (res.error || res.status !== 0) {
    throw new WvError(`Windows could not ${op === 'Protect' ? 'protect' : 'unprotect'} the device secret (DPAPI): ${(res.stderr || res.error?.message || '').trim() || 'unknown error'}`);
  }
  return fromBase64(res.stdout.trim());
}

const KC_SERVICE = 'wreckvault-agent';

function secretStore() {
  if (process.env.WV_SECRET_STORE === 'file') return 'file';
  if (process.platform === 'darwin') return 'keychain';
  if (process.platform === 'win32') return 'dpapi';
  return 'file';
}

function keychainSave(agentId, secretText) {
  // `security -i` reads the command from stdin, so the secret never appears in argv / ps.
  // The secret is base64url and the id a UUID: no quoting issues.
  const cmd = `add-generic-password -U -s ${KC_SERVICE} -a ${agentId} -l "WreckVault agent" -w ${secretText}\n`;
  const res = spawnSync('security', ['-i'], { input: cmd, encoding: 'utf8', timeout: 30000 });
  if (res.error || res.status !== 0) {
    throw new WvError(`macOS Keychain refused to store the device secret: ${(res.stderr || res.error?.message || '').trim() || 'unknown error'}`);
  }
}

function keychainLoad(agentId) {
  const res = spawnSync('security', ['find-generic-password', '-s', KC_SERVICE, '-a', agentId, '-w'], { encoding: 'utf8', timeout: 30000 });
  if (res.error || res.status !== 0) {
    throw new WvError('The device secret is not in the macOS Keychain (or the Keychain is locked). Unlock the Mac, or run `wv login` again.', EXIT.NOT_LOGGED_IN);
  }
  return res.stdout.trim();
}

function keychainDelete(agentId) {
  spawnSync('security', ['delete-generic-password', '-s', KC_SERVICE, '-a', agentId], { encoding: 'utf8', timeout: 30000 });
}

// -> {server, agentId, name, secret, source: 'env' | 'file'} or throws exit 3.
export function loadConnection() {
  const env = process.env.WV_CONNECTION;
  if (env && env.trim()) return { ...parseConnection(env), source: 'env' };
  const cfg = readJson(configFile());
  if (!cfg) throw new WvError('Not logged in. Run `wv login` and paste the connection string from WreckVault → Settings → Claude access.', EXIT.NOT_LOGGED_IN);
  if (cfg.connection) return { ...parseConnection(cfg.connection), source: 'file' };
  if (cfg.store === 'keychain') {
    const secret = keychainLoad(cfg.agentId);
    const parsed = parseConnection(`wvagent1:${Buffer.from(JSON.stringify({ v: 1, server: cfg.server, agentId: cfg.agentId, name: cfg.name, secret })).toString('base64url')}`);
    return { ...parsed, source: 'file' };
  }
  if (cfg.secretDpapi) {
    const secret = dpapi('Unprotect', fromBase64(cfg.secretDpapi));
    return { ...parseConnection(formatConnection({ server: cfg.server, agentId: cfg.agentId, name: cfg.name, secret })), source: 'file' };
  }
  throw new WvError('The saved login is unreadable. Run `wv login` again.', EXIT.NOT_LOGGED_IN);
}

export function saveConnection(conn) {
  const file = configFile();
  const store = secretStore();
  if (store === 'keychain') {
    const secretText = JSON.parse(Buffer.from(formatConnection(conn).slice('wvagent1:'.length), 'base64url').toString('utf8')).secret;
    keychainSave(conn.agentId, secretText);
    writePrivateJson(file, { v: 2, server: conn.server, agentId: conn.agentId, name: conn.name, store: 'keychain' });
  } else if (store === 'dpapi') {
    writePrivateJson(file, {
      v: 1, server: conn.server, agentId: conn.agentId, name: conn.name,
      secretDpapi: toBase64(dpapi('Protect', conn.secret)),
    });
  } else {
    writePrivateJson(file, { v: 1, connection: formatConnection(conn) });
  }
  return file;
}

export function deleteConnection() {
  const cfg = readJson(configFile());
  if (cfg?.store === 'keychain' && cfg.agentId) keychainDelete(cfg.agentId);
  return removeFile(configFile());
}
