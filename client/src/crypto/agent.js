// Agent connector crypto (spec §8.1), shared byte-for-byte with the `wv` CLI.
//   agentToken    = base64url(HKDF-SHA256(deviceSecret, salt empty, info "wreckvault/v2/agent-auth", 32))
//   agentWrapKey  = HKDF-SHA256(deviceSecret, salt empty, info "wreckvault/v2/agent-wrap", 32)
//   grant         = seal(agentWrapKey, collectionKey, "wreckvault/v2/agent-grant:" + agentId + ":" + collectionId)
//   read          = seal(collectionKey, UTF-8(JSON {field, via, host}), "wreckvault/v2/read:" + itemId + ":" + readId)
//   connection    = "wvagent1:" + base64url(UTF-8(JSON {v:1, server, agentId, name, secret}))
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8, fromUtf8, toBase64, fromBase64, randomBytes, uuidv4, UUID_RE } from './bytes.js';
import { seal, open, sealJson, openJson } from './seal.js';

export const HKDF_INFO_AGENT_AUTH = 'wreckvault/v2/agent-auth';
export const HKDF_INFO_AGENT_WRAP = 'wreckvault/v2/agent-wrap';
export const CONNECTION_PREFIX = 'wvagent1:';
export const DEVICE_SECRET_LEN = 32;

export const aadAgentGrant = (agentId, collectionId) => `wreckvault/v2/agent-grant:${agentId}:${collectionId}`;
export const aadRead = (itemId, readId) => `wreckvault/v2/read:${itemId}:${readId}`;

// RFC 4648 §5, no padding.
export function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) {
    throw new Error('Invalid base64url');
  }
  const std = str.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(std + '='.repeat((4 - (std.length % 4)) % 4));
}

function checkSecret(deviceSecret) {
  if (!(deviceSecret instanceof Uint8Array) || deviceSecret.length !== DEVICE_SECRET_LEN) {
    throw new Error('Device secret must be 32 bytes');
  }
}

const derive = (deviceSecret, info) => {
  checkSecret(deviceSecret);
  return hkdf(sha256, deviceSecret, new Uint8Array(0), utf8(info), 32);
};

export function createDeviceCredentials() {
  return { agentId: uuidv4(), deviceSecret: randomBytes(DEVICE_SECRET_LEN) };
}

export const agentToken = (deviceSecret) => toBase64Url(derive(deviceSecret, HKDF_INFO_AGENT_AUTH));
export const agentWrapKey = (deviceSecret) => derive(deviceSecret, HKDF_INFO_AGENT_WRAP);

export const wrapGrant = (wrapKey, collectionKey, agentId, collectionId) =>
  seal(wrapKey, collectionKey, aadAgentGrant(agentId, collectionId));

export function openGrant(wrapKey, wrappedKey, agentId, collectionId) {
  const key = open(wrapKey, wrappedKey, aadAgentGrant(agentId, collectionId));
  if (key.length !== 32) throw new Error('Unwrapped key has the wrong length');
  return key;
}

export function sealRead(collectionKey, itemId, readId, payload) {
  const { field, via, host } = payload || {};
  return sealJson(collectionKey, { field, via, host }, aadRead(itemId, readId));
}

export const openRead = (collectionKey, itemId, readId, encrypted) => openJson(collectionKey, encrypted, aadRead(itemId, readId));

export function buildConnectionString({ server, agentId, name, deviceSecret }) {
  checkSecret(deviceSecret);
  const json = JSON.stringify({ v: 1, server, agentId, name, secret: toBase64Url(deviceSecret) });
  return CONNECTION_PREFIX + toBase64Url(utf8(json));
}

export function parseConnectionString(s) {
  const str = String(s ?? '').trim();
  if (!str.startsWith(CONNECTION_PREFIX)) throw new Error('This is not a WreckVault connection string.');
  let obj;
  try {
    obj = JSON.parse(fromUtf8(fromBase64Url(str.slice(CONNECTION_PREFIX.length))));
  } catch {
    throw new Error('The connection string is damaged. Copy it again.');
  }
  if (!obj || obj.v !== 1 || typeof obj.server !== 'string' || typeof obj.name !== 'string' || !UUID_RE.test(String(obj.agentId))) {
    throw new Error('The connection string is damaged. Copy it again.');
  }
  let deviceSecret;
  try {
    deviceSecret = fromBase64Url(String(obj.secret));
  } catch {
    deviceSecret = null;
  }
  if (!deviceSecret || deviceSecret.length !== DEVICE_SECRET_LEN) throw new Error('The connection string is damaged. Copy it again.');
  return { v: 1, server: obj.server, agentId: obj.agentId, name: obj.name, deviceSecret };
}
