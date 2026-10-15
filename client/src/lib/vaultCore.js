// Vault operations without React: every function takes the axios-like `api` so tests can
// pass an in-memory fake. Keys come from the module-level keystore.
import { uuidv4 } from '../crypto/bytes.js';
import { newKey, wrapCollectionKey, unwrapCollectionKey, sealItem, openItem } from '../crypto/keys.js';
import { getVaultKey, getCollectionKey, setCollectionKey } from '../crypto/keystore.js';
import { createDeviceCredentials, agentToken, agentWrapKey, wrapGrant, buildConnectionString, openRead } from '../crypto/agent.js';
import { zero } from '../crypto/bytes.js';
import { toPayload, decryptedItem, unreadableItem, validateDraft, sortItems } from './itemModel.js';

const PAYLOAD_KEYS = ['title', 'fields', 'notes', 'tags', 'project', 'favorite', 'status', 'supersededBy', 'links', 'attachments'];

export function publicCollection(c) {
  const out = { id: c.id, name: c.name, kind: c.kind, agentAccess: c.agentAccess === true, sort: c.sort ?? 0, createdAt: c.createdAt ?? null };
  if (c.keyError) out.keyError = true;
  return out;
}

export function sortCollections(list) {
  const rank = { personal: 0, alfred: 1 };
  return [...list].sort((a, b) => (rank[a.kind] ?? 2) - (rank[b.kind] ?? 2)
    || (a.sort ?? 0) - (b.sort ?? 0)
    || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
    || String(a.name).localeCompare(String(b.name)));
}

// Opens a server row; an item that cannot be opened is kept, flagged decryptError.
export function openRow(row) {
  try {
    const payload = openItem(getCollectionKey(row.collectionId), row.id, row.type, row.encrypted);
    return decryptedItem(row, payload);
  } catch {
    return unreadableItem(row);
  }
}

export async function loadVault(api) {
  const [cRes, iRes] = await Promise.all([api.get('/collections'), api.get('/items')]);
  const vaultKey = getVaultKey();
  const collections = (cRes.data || []).map((c) => {
    try {
      setCollectionKey(c.id, unwrapCollectionKey(vaultKey, c.wrappedKey, c.id));
      return publicCollection(c);
    } catch {
      return publicCollection({ ...c, keyError: true });
    }
  });
  const items = (iRes.data || []).map(openRow);
  return { collections: sortCollections(collections), items: sortItems(items) };
}

export function personalCollectionId(collections) {
  const p = collections.find((c) => c.kind === 'personal' && !c.keyError) || collections.find((c) => !c.keyError);
  if (!p) throw new Error('No collection is available to save into. Reload the vault and try again.');
  return p.id;
}

function pickPayload(src) {
  const out = {};
  for (const k of PAYLOAD_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

function checkDraft(draft) {
  const problem = validateDraft(draft);
  if (problem) throw new Error(problem);
}

export async function createItemOp(api, draft, collections) {
  const full = { ...draft };
  checkDraft(full);
  const collectionId = full.collectionId || personalCollectionId(collections);
  const id = uuidv4();
  const payload = toPayload(pickPayload(full));
  const encrypted = sealItem(getCollectionKey(collectionId), id, full.type, payload);
  const { data: row } = await api.post('/items', { id, collectionId, type: full.type, encrypted });
  return decryptedItem(row, payload);
}

export async function updateItemOp(api, existing, draft) {
  if (!existing) throw new Error('That item no longer exists. Reload the vault and try again.');
  if (existing.decryptError) throw new Error('This item could not be decrypted, so it cannot be changed.');
  const merged = { ...existing, ...draft, id: existing.id };
  checkDraft(merged);
  const collectionId = merged.collectionId || existing.collectionId;
  const payload = toPayload(pickPayload(merged));
  const encrypted = sealItem(getCollectionKey(collectionId), existing.id, merged.type, payload);
  const { data: row } = await api.put(`/items/${existing.id}`, { collectionId, type: merged.type, encrypted });
  return decryptedItem(row, payload);
}

// Applies a server row that only changed metadata (trash/restore) to the cached item.
export function withRow(item, row) {
  return { ...item, deletedAt: row.deletedAt ?? null, updatedAt: row.updatedAt ?? item.updatedAt };
}

export async function trashItemOp(api, item) {
  const { data: row } = await api.delete(`/items/${item.id}`);
  return withRow(item, row);
}

export async function restoreItemOp(api, item) {
  const { data: row } = await api.post(`/items/${item.id}/restore`);
  return withRow(item, row);
}

export async function deleteForeverOp(api, id) {
  await api.delete(`/items/${id}/permanent`);
}

export async function getHistoryOp(api, item) {
  const { data } = await api.get(`/items/${item.id}/history`);
  return (data || []).map((h) => {
    const meta = {
      id: item.id, type: h.type, collectionId: h.collectionId, createdAt: item.createdAt,
      updatedAt: h.versionUpdatedAt, deletedAt: null, legacyEntryId: item.legacyEntryId,
    };
    let version;
    try {
      version = decryptedItem(meta, openItem(getCollectionKey(h.collectionId), item.id, h.type, h.encrypted));
    } catch {
      version = unreadableItem(meta);
    }
    return { historyId: h.id, replacedAt: h.replacedAt, item: version };
  });
}

export async function createCollectionOp(api, name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('Give the collection a name.');
  const id = uuidv4();
  const key = newKey();
  const wrappedKey = wrapCollectionKey(getVaultKey(), key, id);
  const { data: row } = await api.post('/collections', { id, name: clean, kind: 'custom', agentAccess: false, wrappedKey });
  setCollectionKey(id, key);
  return publicCollection(row);
}

// --- Claude access (spec §8) ---

export function publicAgent(a) {
  return {
    id: a.id,
    name: a.name,
    canWrite: a.canWrite === true,
    createdAt: a.createdAt ?? null,
    lastUsedAt: a.lastUsedAt ?? null,
    revokedAt: a.revokedAt ?? null,
    collectionIds: Array.isArray(a.collectionIds) ? a.collectionIds : [],
  };
}

export async function listAgentsOp(api) {
  const { data } = await api.get('/agents');
  return (data || []).map(publicAgent);
}

// Generates the device credentials in the browser, wraps each chosen collection key for the
// device, registers it, and returns the one-time connection string.
export async function createAgentOp(api, { name, collectionIds, canWrite }, server) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('Give the device a name.');
  if (clean.length > 60) throw new Error('Use a device name of 60 characters or fewer.');
  const ids = [...new Set(collectionIds || [])];
  if (!ids.length) throw new Error('Choose at least one collection.');
  const { agentId, deviceSecret } = createDeviceCredentials();
  const wrapKey = agentWrapKey(deviceSecret);
  try {
    const grants = ids.map((collectionId) => ({
      collectionId,
      wrappedKey: wrapGrant(wrapKey, getCollectionKey(collectionId), agentId, collectionId),
    }));
    const token = agentToken(deviceSecret);
    const { data: row } = await api.post('/agents', { id: agentId, name: clean, canWrite: canWrite === true, token, grants });
    const connectionString = buildConnectionString({ server, agentId, name: clean, deviceSecret });
    return { agent: publicAgent({ collectionIds: ids, ...row }), connectionString };
  } finally {
    zero(wrapKey);
    zero(deviceSecret);
  }
}

export async function revokeAgentOp(api, id) {
  const { data: row } = await api.delete(`/agents/${id}`);
  return publicAgent(row);
}

// Rows that cannot be opened stay listed with field "unknown".
export async function getReadsOp(api, item, limit = 50) {
  const { data } = await api.get(`/items/${item.id}/reads?limit=${limit}`);
  return (data || []).map((r) => {
    let field = 'unknown';
    let via = '';
    let host = '';
    try {
      const p = openRead(getCollectionKey(item.collectionId), item.id, r.id, r.encrypted);
      if (typeof p?.field === 'string' && p.field) field = p.field;
      if (typeof p?.via === 'string') via = p.via;
      if (typeof p?.host === 'string') host = p.host;
    } catch {
      /* keep the row, unreadable */
    }
    return { id: r.id, createdAt: r.createdAt ?? null, agentName: r.agentName ?? null, field, via, host };
  });
}

export async function readFileText(file) {
  if (typeof file === 'string') return file;
  if (file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsText(file);
  });
}
