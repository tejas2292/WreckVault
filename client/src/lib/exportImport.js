// Plaintext export (v2) and import parsing (v2 export, v1 export array, CSV).
import { TYPE_KEYS } from './itemTypes.js';
import { toPayload } from './itemModel.js';
import { mapDecrypted, mapUndecryptable } from './legacy.js';

export const EXPORT_FORMAT = 'wreckvault-v2-export';

// items = DecryptedItem[]; unreadable items carry no content and are left out.
export function buildExport(items, exportedAt = new Date().toISOString()) {
  return {
    format: EXPORT_FORMAT,
    exportedAt,
    items: items.filter((i) => !i.decryptError).map((i) => {
      const copy = { ...i };
      delete copy.decryptError;
      return copy;
    }),
  };
}

// RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines. Returns rows of strings.
export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i += 1;
  }
  if (quoted) throw new Error('The CSV file has an unclosed quote. Check the file and try again.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const CSV_COLUMNS = {
  name: ['name', 'title'],
  url: ['url', 'login_uri', 'website', 'uri'],
  username: ['username', 'login_username', 'user'],
  password: ['password', 'login_password'],
  notes: ['notes', 'note', 'extra'],
};

function csvToDrafts(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { drafts: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(CSV_COLUMNS)) {
    col[key] = header.findIndex((h) => names.includes(h));
  }
  if (col.password < 0 || (col.name < 0 && col.url < 0)) {
    throw new Error('The CSV file needs a header row with name, url, username, password and notes columns.');
  }
  const drafts = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? '') : '');
    const name = get('name').trim();
    const url = get('url').trim();
    const username = get('username');
    const password = get('password');
    const notes = get('notes');
    if (!name && !url && !username && !password && !notes) { skipped += 1; continue; }
    let title = name;
    if (!title && url) {
      try { title = new URL(url).hostname; } catch { title = url; }
    }
    const fields = [];
    if (username) fields.push({ label: 'Username', kind: 'text', value: username });
    fields.push({ label: 'Password', kind: 'secret', value: password });
    if (url) fields.push({ label: 'Website', kind: 'url', value: url });
    drafts.push({ type: 'login', ...toPayload({ title: title || 'Imported login', fields, notes }) });
  }
  return { drafts, skipped };
}

function v2ToDrafts(data) {
  const drafts = [];
  let skipped = 0;
  for (const it of Array.isArray(data.items) ? data.items : []) {
    if (!it || typeof it !== 'object' || it.decryptError || !TYPE_KEYS.includes(it.type)) { skipped += 1; continue; }
    const draft = { type: it.type, ...toPayload(it) };
    if (it.deletedAt) draft.deletedAt = it.deletedAt;
    drafts.push(draft);
  }
  return { drafts, skipped };
}

function v1ToDrafts(arr) {
  const drafts = [];
  let skipped = 0;
  for (const e of arr) {
    if (!e || typeof e !== 'object') { skipped += 1; continue; }
    // A raw row from the pre-upgrade backup that could not be decrypted.
    if (e.undecryptable && e.encryptedBlob) {
      const m = mapUndecryptable(e);
      drafts.push({ type: m.type, ...m.payload });
      continue;
    }
    if (!e.service_name) { skipped += 1; continue; }
    const kind = e.entry_type === 'card' || e.entry_type === 'note' ? e.entry_type : 'password';
    const data = e.decrypted_data;
    const hasData = data && typeof data === 'object' && !Array.isArray(data);
    if ((kind === 'card' || kind === 'note') && !hasData) { skipped += 1; continue; }
    if (kind === 'password' && !e.password) { skipped += 1; continue; }
    const m = mapDecrypted(
      { serviceName: e.service_name, accountUsername: e.account_username, websiteUrl: e.website_url, category: e.category, isFavorite: e.is_favorite === true },
      kind, e.password, data,
    );
    drafts.push({ type: m.type, ...m.payload });
  }
  return { drafts, skipped };
}

// -> {format: 'wreckvault-v2'|'wreckvault-v1'|'csv', drafts, skipped}. Throws a readable Error.
export function parseImport(text, filename = '') {
  const t = String(text ?? '').replace(/^\uFEFF/, '');
  const trimmed = t.trim();
  if (!trimmed) throw new Error('The file is empty.');
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    let data;
    try { data = JSON.parse(trimmed); } catch {
      throw new Error('The file looks like JSON but could not be read. Check that it is a complete WreckVault export.');
    }
    if (Array.isArray(data)) return { format: 'wreckvault-v1', ...v1ToDrafts(data) };
    if (data && data.format === EXPORT_FORMAT) return { format: 'wreckvault-v2', ...v2ToDrafts(data) };
    throw new Error('This JSON file is not a WreckVault export.');
  }
  if (/\.json$/i.test(filename)) throw new Error('This JSON file is not a WreckVault export.');
  return { format: 'csv', ...csvToDrafts(t) };
}
