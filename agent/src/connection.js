// Connection string (spec §8.1):
//   "wvagent1:" + base64url(UTF-8(JSON {v:1, server, agentId, name, secret: base64url(deviceSecret)}))
import { utf8, fromUtf8, toBase64Url, fromBase64Url, UUID_RE } from './crypto.js';
import { WvError } from './errors.js';

export const CONNECTION_PREFIX = 'wvagent1:';

const bad = (why) => new WvError(`That is not a valid WreckVault connection string (${why}). Copy it again from Settings → Claude access.`);

export function parseConnection(input) {
  const s = String(input ?? '').trim();
  if (!s.startsWith(CONNECTION_PREFIX)) throw bad('it should start with "wvagent1:"');
  let obj;
  try {
    obj = JSON.parse(fromUtf8(fromBase64Url(s.slice(CONNECTION_PREFIX.length))));
  } catch {
    throw bad('it could not be decoded');
  }
  if (!obj || obj.v !== 1) throw bad('unsupported version');
  let origin;
  try {
    const u = new URL(String(obj.server));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    origin = u.origin;
  } catch {
    throw bad('the server address is not a valid http(s) origin');
  }
  if (!UUID_RE.test(String(obj.agentId))) throw bad('the device id is not a UUID');
  let secret;
  try {
    secret = fromBase64Url(String(obj.secret));
  } catch {
    secret = null;
  }
  if (!secret || secret.length !== 32) throw bad('the device secret must be 32 bytes');
  return { server: origin, agentId: String(obj.agentId).toLowerCase(), name: String(obj.name ?? ''), secret };
}

export function formatConnection({ server, agentId, name, secret }) {
  const json = JSON.stringify({ v: 1, server, agentId, name, secret: toBase64Url(secret) });
  return CONNECTION_PREFIX + toBase64Url(utf8(json));
}
