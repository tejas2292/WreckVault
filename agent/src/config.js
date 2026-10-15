// Saved login (spec §8.5). POSIX: {v:1, connection}. Windows: the device secret is
// DPAPI-protected (CurrentUser) via a spawned PowerShell; data goes over stdin, never argv.
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

// -> {server, agentId, name, secret, source: 'env' | 'file'} or throws exit 3.
export function loadConnection() {
  const env = process.env.WV_CONNECTION;
  if (env && env.trim()) return { ...parseConnection(env), source: 'env' };
  const cfg = readJson(configFile());
  if (!cfg) throw new WvError('Not logged in. Run `wv login` and paste the connection string from WreckVault → Settings → Claude access.', EXIT.NOT_LOGGED_IN);
  if (cfg.connection) return { ...parseConnection(cfg.connection), source: 'file' };
  if (cfg.secretDpapi) {
    const secret = dpapi('Unprotect', fromBase64(cfg.secretDpapi));
    return { ...parseConnection(formatConnection({ server: cfg.server, agentId: cfg.agentId, name: cfg.name, secret })), source: 'file' };
  }
  throw new WvError('The saved login is unreadable. Run `wv login` again.', EXIT.NOT_LOGGED_IN);
}

export function saveConnection(conn) {
  const file = configFile();
  if (process.platform === 'win32') {
    writePrivateJson(file, {
      v: 1, server: conn.server, agentId: conn.agentId, name: conn.name,
      secretDpapi: toBase64(dpapi('Protect', conn.secret)),
    });
  } else {
    writePrivateJson(file, { v: 1, connection: formatConnection(conn) });
  }
  return file;
}

export const deleteConnection = () => removeFile(configFile());
