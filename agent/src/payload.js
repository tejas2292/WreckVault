// Item payload handling. `toPayload` is a port of client/src/lib/itemModel.js (used for
// reading); `buildPayload` and `mergePayload` are the agent write paths, which keep every
// payload key (and every field key) they do not change, so the web app reads them unchanged.
import { FIELD_KINDS, TYPE_KEYS, ITEM_STATUSES } from './itemTypes.js';
import { shortId } from './crypto.js';
import { WvError } from './errors.js';

export const PAYLOAD_VERSION = 1;
export const SECRET_KINDS = ['secret', 'multi', 'totp'];
export const newFieldId = () => shortId(8);

const str = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function normalizeField(f, i) {
  const o = f && typeof f === 'object' ? f : {};
  return {
    id: str(o.id) || `f${i + 1}-${newFieldId()}`,
    label: str(o.label),
    kind: has(FIELD_KINDS, o.kind) ? o.kind : 'text',
    value: str(o.value),
  };
}

function uniqueStrings(list) {
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const s = str(t).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Normalized view of a decrypted payload (as the web client shows it).
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
    attachments: Array.isArray(o.attachments) ? o.attachments : [],
  };
}

export function checkType(type) {
  if (!TYPE_KEYS.includes(type)) {
    throw new WvError(`Unknown item type "${type}". Use one of: ${TYPE_KEYS.join(', ')}.`);
  }
  return type;
}

export function checkKind(kind) {
  if (!has(FIELD_KINDS, kind)) {
    throw new WvError(`Unknown field kind "${kind}". Use one of: ${Object.keys(FIELD_KINDS).join(', ')}.`);
  }
  return kind;
}

function checkLabel(label) {
  const l = str(label).trim();
  if (!l) throw new WvError('Every field needs a label.');
  return l;
}

const sameLabel = (a, b) => str(a).trim().toLowerCase() === str(b).trim().toLowerCase();

// New item payload (wv_put).
export function buildPayload({ title, fields = [], notes = '', tags = [], project = '' }) {
  const t = str(title).trim();
  if (!t) throw new WvError('Give the item a title.');
  return {
    v: PAYLOAD_VERSION,
    title: t,
    fields: fields.map((f) => ({
      id: newFieldId(),
      label: checkLabel(f.label),
      kind: checkKind(f.kind ?? 'text'),
      value: str(f.value),
    })),
    notes: str(notes),
    tags: uniqueStrings(tags),
    project: str(project).trim(),
    favorite: false,
    status: 'active',
    supersededBy: null,
    links: [],
    attachments: [],
  };
}

// Apply a wv_update change set to a raw decrypted payload. Returns a new object; keys the
// change does not mention (including unknown ones) are carried over untouched.
export function mergePayload(raw, change = {}) {
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { ...base };
  let fields = Array.isArray(base.fields) ? base.fields.map((f) => (f && typeof f === 'object' ? { ...f } : f)) : [];

  if (change.removeFields?.length) {
    for (const label of change.removeFields) {
      const before = fields.length;
      fields = fields.filter((f) => !(f && sameLabel(f.label, label)));
      if (fields.length === before) throw new WvError(`The item has no field "${label}".`);
    }
  }
  for (const sf of change.setFields || []) {
    const label = checkLabel(sf.label);
    const existing = fields.find((f) => f && sameLabel(f.label, label));
    if (existing) {
      if (sf.kind !== undefined) existing.kind = checkKind(sf.kind);
      existing.value = str(sf.value);
    } else {
      fields.push({ id: newFieldId(), label, kind: checkKind(sf.kind ?? 'text'), value: str(sf.value) });
    }
  }
  if (change.setFields?.length || change.removeFields?.length) out.fields = fields;

  if (change.title !== undefined) {
    const t = str(change.title).trim();
    if (!t) throw new WvError('The title cannot be empty.');
    out.title = t;
  }
  if (change.notes !== undefined) out.notes = str(change.notes);
  if (change.tags !== undefined) out.tags = uniqueStrings(change.tags);
  if (change.project !== undefined) out.project = str(change.project).trim();
  if (change.status !== undefined) {
    if (!ITEM_STATUSES.includes(change.status)) {
      throw new WvError(`Unknown status "${change.status}". Use one of: ${ITEM_STATUSES.join(', ')}.`);
    }
    out.status = change.status;
  }
  if (change.supersededBy !== undefined) out.supersededBy = change.supersededBy ? str(change.supersededBy) : null;
  if (out.v === undefined) out.v = PAYLOAD_VERSION;
  return out;
}
