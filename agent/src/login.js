// `wv login` / `wv logout`.
import { parseConnection } from './connection.js';
import { saveConnection, deleteConnection } from './config.js';
import { deleteCache } from './cache.js';
import { Vault } from './vault.js';
import { WvError } from './errors.js';

// Verifies with GET /agent/v1/me (no cache fallback), checks every grant unwraps, saves.
export async function login(connectionString, opts = {}) {
  const conn = parseConnection(connectionString);
  const vault = new Vault(conn, opts);
  const me = await vault.http.me();
  if (!me?.agent || me.agent.id?.toLowerCase() !== conn.agentId) throw new WvError('The server answered for a different device. Check the connection string.');
  vault.me = me;
  vault.rawItems = [];
  vault.decrypt();
  const broken = vault.collections.filter((c) => !c.key);
  if (broken.length) {
    throw new WvError(`The connection string does not match this device's grants (${broken.map((c) => c.name).join(', ')}). Create a new connection in WreckVault.`);
  }
  deleteCache();
  const file = saveConnection(conn);
  await vault.load();
  return { file, vault };
}

export function logout() {
  const a = deleteConnection();
  const b = deleteCache();
  return a || b;
}
