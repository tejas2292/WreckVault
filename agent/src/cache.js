// Offline cache (spec §8.5): the raw /me + /items JSON (ciphertext only) and queued reads.
import { cacheFile } from './paths.js';
import { readJson, writePrivateJson, removeFile } from './files.js';

export function loadCache(agentId) {
  const c = readJson(cacheFile());
  if (!c || c.v !== 1 || c.agentId !== agentId) return null;
  return { savedAt: c.savedAt ?? null, me: c.me ?? null, items: Array.isArray(c.items) ? c.items : null, pendingReads: Array.isArray(c.pendingReads) ? c.pendingReads : [] };
}

export function saveCache(agentId, { savedAt, me, items, pendingReads }) {
  writePrivateJson(cacheFile(), { v: 1, agentId, savedAt, me, items, pendingReads: pendingReads || [] });
}

export const deleteCache = () => removeFile(cacheFile());

export function formatAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
