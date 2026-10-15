// The agent's view of the vault: fetch (or fall back to cache), decrypt, resolve, log reads,
// write. Every network failure falls back to the cache for reads; writes need the server.
import os from 'node:os';
import {
  deriveAgentKeys, unwrapGrantKey, openItem, sealItem, sealRead, uuidv4,
} from './crypto.js';
import { createHttp } from './http.js';
import { loadConnection } from './config.js';
import { loadCache, saveCache, formatAge } from './cache.js';
import { toPayload, buildPayload, mergePayload, checkType, SECRET_KINDS } from './payload.js';
import { resolveItem, resolveField } from './resolve.js';
import { totpCode } from './totp.js';
import { WvError, NetworkError, ApiError, EXIT } from './errors.js';
import { writeGuardHashes } from './guardHashes.js';

export const MASK = '••••••••';
export const SECRET_PLACEHOLDER = '[secret]';
export const isSecretKind = (kind) => SECRET_KINDS.includes(kind);

const log = (msg) => process.stderr.write(`wv: ${msg}\n`);

export class Vault {
  constructor(conn, { now = () => Date.now(), host = os.hostname(), warn = log } = {}) {
    this.conn = conn;
    const { agentToken, agentWrapKey } = deriveAgentKeys(conn.secret);
    this.wrapKey = agentWrapKey;
    this.http = createHttp({ server: conn.server, agentId: conn.agentId, agentToken });
    this.now = now;
    this.host = host;
    this.warn = warn;
    this.offline = false;
    this.cachedAt = null;
    this.me = null;
    this.rawItems = [];
    this.pendingReads = [];
  }

  static fromConfig(opts) {
    return new Vault(loadConnection(), opts);
  }

  // Fetch /me + /items; on a network failure use the cache. Throws exit 4 when neither works.
  async load() {
    const cache = loadCache(this.conn.agentId);
    this.pendingReads = cache?.pendingReads || [];
    try {
      const me = await this.http.me();
      const items = await this.http.items();
      this.me = me;
      this.rawItems = Array.isArray(items) ? items : [];
      this.offline = false;
      this.cachedAt = this.now();
      this.persist();
      await this.flushReads();
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e;
      if (!cache?.me || !cache.items) {
        throw new WvError(`${e.message} No cached copy is available on this device yet.`, EXIT.UNREACHABLE);
      }
      this.me = cache.me;
      this.rawItems = cache.items;
      this.offline = true;
      this.cachedAt = cache.savedAt;
    }
    this.decrypt();
    this.refreshGuard();
    return this;
  }

  // Keep the local guard hash list in step with the vault (see guardHashes.js). Never fatal.
  refreshGuard() {
    if (process.env.WV_NO_GUARD === '1') return null;
    try { return writeGuardHashes(this.readable(), { device: this.conn.name }); }
    catch (e) { this.warn(`could not write the guard hash list (${e.message})`); return null; }
  }

  persist() {
    try {
      saveCache(this.conn.agentId, { savedAt: this.cachedAt ?? this.now(), me: this.me, items: this.rawItems, pendingReads: this.pendingReads });
    } catch (e) {
      this.warn(`could not write the cache (${e.message})`);
    }
  }

  get offlineNote() {
    if (!this.offline) return null;
    return `offline, cached ${formatAge(this.now() - (this.cachedAt ?? this.now()))} ago`;
  }

  decrypt() {
    const agentId = this.conn.agentId;
    this.collections = (this.me?.collections || []).map((c) => {
      let key = null;
      try { key = unwrapGrantKey(this.wrapKey, c.wrappedKey, agentId, c.id); } catch { key = null; }
      return { id: c.id, name: c.name, kind: c.kind, key };
    });
    const byId = new Map(this.collections.map((c) => [c.id, c]));
    this.items = this.rawItems.map((row) => {
      const coll = byId.get(row.collectionId);
      const meta = { id: row.id, collectionId: row.collectionId, collection: coll?.name ?? null, type: row.type, createdAt: row.createdAt ?? null, updatedAt: row.updatedAt ?? null };
      try {
        if (!coll?.key) throw new Error('no key');
        const raw = openItem(coll.key, row.id, row.type, row.encrypted);
        return { ...meta, ...toPayload(raw), raw, decryptError: false };
      } catch {
        return { ...meta, ...toPayload({ title: 'Unreadable item' }), raw: null, decryptError: true };
      }
    });
    if (this.collections.some((c) => !c.key)) this.warn('a collection key could not be unwrapped; its items are unreadable. Run `wv login` again.');
  }

  get agent() { return this.me?.agent || { id: this.conn.agentId, name: this.conn.name, canWrite: false }; }

  readable() { return this.items.filter((it) => !it.decryptError); }

  find(query) { return resolveItem(this.readable(), query); }

  // Filtered list for `ls` / wv_search.
  list({ query, type, project, includeInactive = true } = {}) {
    const q = String(query ?? '').trim().toLowerCase();
    const p = String(project ?? '').trim().toLowerCase();
    return this.readable().filter((it) => {
      if (!includeInactive && it.status !== 'active') return false;
      if (type && it.type !== type) return false;
      if (p && it.project.toLowerCase() !== p) return false;
      if (q) {
        const hay = [it.title, it.project, it.type, ...it.tags].join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id));
  }

  // Get one field's value (or every field with field "*"); logs the read.
  async get(itemQuery, fieldLabel, { via = 'cli', raw = false } = {}) {
    const item = this.find(itemQuery);
    if (fieldLabel === '*') {
      await this.logRead(item, '*', via);
      return { item, field: null, value: null, fields: item.fields.map(({ label, kind, value }) => ({ label, kind, value })) };
    }
    const field = resolveField(item, fieldLabel);
    let value = field.value;
    if (field.kind === 'totp' && !raw) {
      const code = totpCode(field.value, this.now());
      if (code === null) throw new WvError(`The one-time code secret in "${item.title}" → "${field.label}" is not usable.`);
      value = code;
    }
    await this.logRead(item, field.label, via);
    return { item, field, value };
  }

  // Seal {field, via, host} with the collection key; post now, or queue when offline.
  async logRead(item, field, via) {
    const coll = this.collections.find((c) => c.id === item.collectionId);
    if (!coll?.key) return;
    const id = uuidv4();
    const encrypted = sealRead(coll.key, item.id, id, { field, via, host: this.host });
    const entry = { itemId: item.id, id, encrypted };
    if (this.offline) {
      this.pendingReads.push(entry);
      this.persist();
      return;
    }
    try {
      await this.http.logRead(item.id, { id, encrypted });
    } catch (e) {
      if (e instanceof NetworkError) {
        this.pendingReads.push(entry);
        this.persist();
      } else {
        this.warn(`the read was not logged (${e.message})`);
      }
    }
  }

  async flushReads() {
    if (!this.pendingReads.length) return 0;
    const left = [];
    let sent = 0;
    for (let i = 0; i < this.pendingReads.length; i++) {
      const r = this.pendingReads[i];
      try {
        await this.http.logRead(r.itemId, { id: r.id, encrypted: r.encrypted });
        sent++;
      } catch (e) {
        if (e instanceof NetworkError) { left.push(...this.pendingReads.slice(i)); break; }
        if (!(e instanceof ApiError && e.status === 409)) this.warn(`a queued read was dropped (${e.message})`);
      }
    }
    this.pendingReads = left;
    this.persist();
    return sent;
  }

  requireOnline(what) {
    if (this.offline) throw new WvError(`Cannot ${what} while the server is unreachable (${this.offlineNote}).`, EXIT.UNREACHABLE);
  }

  pickCollection(name) {
    const usable = this.collections.filter((c) => c.key);
    if (name) {
      const n = String(name).trim().toLowerCase();
      const c = usable.find((x) => x.id.toLowerCase() === n) || usable.find((x) => x.name.toLowerCase() === n);
      if (!c) throw new WvError(`This device has no access to a collection named "${name}". Granted: ${usable.map((x) => x.name).join(', ') || '(none)'}.`, EXIT.NOT_FOUND);
      return c;
    }
    const alfred = usable.find((c) => c.kind === 'alfred');
    if (!alfred) throw new WvError(`This device has no access to the ALFRED collection; name a collection (${usable.map((x) => x.name).join(', ') || 'none granted'}).`);
    return alfred;
  }

  // wv_put
  async put({ type, title, fields = [], project, tags, notes, collection }) {
    this.requireOnline('create an item');
    checkType(type);
    const coll = this.pickCollection(collection);
    const payload = buildPayload({ title, fields, notes, tags, project });
    const id = uuidv4();
    const row = await this.http.createItem({ id, collectionId: coll.id, type, encrypted: sealItem(coll.key, id, type, payload) });
    this.upsertRow(row ?? { id, collectionId: coll.id, type, encrypted: null });
    return { id, title: payload.title, type, collection: coll.name };
  }

  // wv_update: merge into the raw payload (unknown keys preserved); same id, collection, type.
  async update(itemQuery, change) {
    this.requireOnline('update an item');
    const item = this.find(itemQuery);
    const coll = this.collections.find((c) => c.id === item.collectionId);
    const payload = mergePayload(item.raw, change);
    const row = await this.http.updateItem(item.id, {
      collectionId: item.collectionId, type: item.type, encrypted: sealItem(coll.key, item.id, item.type, payload),
    });
    if (row) this.upsertRow(row);
    return { id: item.id, title: payload.title, type: item.type, collection: coll.name };
  }

  upsertRow(row) {
    if (!row?.encrypted) return;
    const r = { id: row.id, collectionId: row.collectionId, type: row.type, encrypted: row.encrypted, createdAt: row.createdAt, updatedAt: row.updatedAt };
    const i = this.rawItems.findIndex((x) => x.id === r.id);
    if (i >= 0) this.rawItems[i] = r; else this.rawItems.push(r);
    this.persist();
    this.decrypt();
  }

  status() {
    return {
      server: this.conn.server,
      device: this.agent.name || this.conn.name,
      agentId: this.conn.agentId,
      permission: this.agent.canWrite ? 'read and write' : 'read only',
      collections: this.collections.map((c) => ({ name: c.name, kind: c.kind, items: this.items.filter((it) => it.collectionId === c.id).length })),
      items: this.items.length,
      unreadable: this.items.filter((it) => it.decryptError).length,
      offline: this.offline,
      cacheAge: this.cachedAt ? formatAge(this.now() - this.cachedAt) : null,
      pendingReads: this.pendingReads.length,
      source: this.conn.source || null,
    };
  }
}

// Search result shape for wv_search / `ls --json`: secret/multi/totp values never included.
export function publicItem(it) {
  return {
    id: it.id,
    title: it.title,
    type: it.type,
    project: it.project,
    tags: it.tags,
    status: it.status,
    collection: it.collection,
    fields: it.fields.map(({ label, kind, value }) => ({ label, kind, value: isSecretKind(kind) ? SECRET_PLACEHOLDER : value })),
  };
}

export function formatStatus(s) {
  const lines = [
    `Server:      ${s.server}${s.offline ? `  (offline, cached ${s.cacheAge} ago)` : ''}`,
    `Device:      ${s.device}`,
    `Permission:  ${s.permission}`,
    `Collections: ${s.collections.map((c) => `${c.name} (${c.items})`).join(', ') || '(none)'}`,
    `Items:       ${s.items}${s.unreadable ? ` (${s.unreadable} unreadable)` : ''}`,
    `Cache:       ${s.cacheAge ? `${s.cacheAge} old` : 'none'}${s.pendingReads ? `, ${s.pendingReads} read(s) waiting to be logged` : ''}`,
  ];
  if (s.source === 'env') lines.push('Login:       from WV_CONNECTION');
  return lines.join('\n');
}
