// Item payload model (spec §3 "Item payload") and the DecryptedItem shape (spec §5).
import { ITEM_TYPES, TYPE_KEYS, FIELD_KINDS, ITEM_STATUSES } from './itemTypes.js';
import { shortId } from '../crypto/bytes.js';

export const PAYLOAD_VERSION = 1;
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
export const UNREADABLE_TITLE = 'Unreadable item';

const str = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v));

export const newFieldId = () => shortId(8);
export const newAttachmentId = () => shortId(10);

function normalizeField(f, i) {
  const o = f && typeof f === 'object' ? f : {};
  return {
    id: str(o.id) || `f${i + 1}-${newFieldId()}`,
    label: str(o.label),
    kind: Object.prototype.hasOwnProperty.call(FIELD_KINDS, o.kind) ? o.kind : 'text',
    value: str(o.value),
  };
}

function normalizeAttachment(a) {
  const o = a && typeof a === 'object' ? a : {};
  const data = str(o.data);
  return {
    id: str(o.id) || newAttachmentId(),
    name: str(o.name) || 'attachment',
    mime: str(o.mime) || 'application/octet-stream',
    size: Number.isFinite(o.size) ? o.size : base64Size(data),
    data,
  };
}

export function base64Size(b64) {
  if (!b64) return 0;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function uniqueStrings(list) {
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const s = str(t).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Coerce anything item-like into a clean payload with every key present, in a fixed order.
export function toPayload(src) {
  const o = src && typeof src === 'object' ? src : {};
  return {
    v: PAYLOAD_VERSION,
    title: str(o.title),
    fields: (Array.isArray(o.fields) ? o.fields : []).map(normalizeField),
    notes: str(o.notes),
    tags: uniqueStrings(o.tags),
    project: str(o.project).trim(),
    favorite: o.favorite === true,
    status: ITEM_STATUSES.includes(o.status) ? o.status : 'active',
    supersededBy: o.supersededBy ? str(o.supersededBy) : null,
    links: uniqueStrings(o.links),
    attachments: (Array.isArray(o.attachments) ? o.attachments : []).map(normalizeAttachment),
  };
}

const PAYLOAD_KEYS = ['title', 'fields', 'notes', 'tags', 'project', 'favorite', 'status', 'supersededBy', 'links', 'attachments'];

// meta = server row {id, collectionId, type, createdAt, updatedAt, deletedAt, legacyEntryId}
export function decryptedItem(meta, payload) {
  const p = toPayload(payload);
  const item = {
    id: meta.id,
    type: meta.type,
    collectionId: meta.collectionId,
    createdAt: meta.createdAt ?? null,
    updatedAt: meta.updatedAt ?? null,
    deletedAt: meta.deletedAt ?? null,
    legacyEntryId: meta.legacyEntryId ?? null,
  };
  for (const k of PAYLOAD_KEYS) item[k] = p[k];
  return item;
}

export function unreadableItem(meta) {
  return { ...decryptedItem(meta, { title: UNREADABLE_TITLE }), decryptError: true };
}

// A new, unsaved item of `type` with the template's fields.
export function blankItem(type = 'login', collectionId = null) {
  const t = ITEM_TYPES[type] ? type : 'login';
  return {
    ...decryptedItem(
      { id: null, type: t, collectionId },
      { fields: ITEM_TYPES[t].template.map(([label, kind]) => ({ id: newFieldId(), label, kind, value: '' })) },
    ),
  };
}

// Returns an error sentence, or null when the draft can be saved.
export function validateDraft(draft) {
  if (!draft || typeof draft !== 'object') return 'Nothing to save.';
  if (!TYPE_KEYS.includes(draft.type)) return 'Choose an item type.';
  if (!str(draft.title).trim()) return 'Give the item a title.';
  for (const a of Array.isArray(draft.attachments) ? draft.attachments : []) {
    const size = Number.isFinite(a?.size) ? a.size : base64Size(str(a?.data));
    if (size > MAX_ATTACHMENT_BYTES || base64Size(str(a?.data)) > MAX_ATTACHMENT_BYTES) {
      return `The attachment "${str(a?.name) || 'attachment'}" is larger than 1 MB. Attach a smaller file.`;
    }
  }
  return null;
}

export function sortItems(items) {
  return [...items].sort((a, b) => {
    const c = str(a.title).localeCompare(str(b.title), undefined, { sensitivity: 'base', numeric: true });
    return c !== 0 ? c : str(a.id).localeCompare(str(b.id));
  });
}

// Structural equality for JSON values (key order ignored).
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}
