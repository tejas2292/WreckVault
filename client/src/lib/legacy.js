// v1 data: decrypt exactly like the v1 app, map each row to one v2 payload (spec §4),
// and build the pre-upgrade backup in the v1 export format.
import CryptoJS from 'crypto-js';
import { toPayload } from './itemModel.js';

export const UNDECRYPTABLE_TAG = 'legacy-undecryptable';
const CARD_KEYS = ['cardholder_name', 'card_number', 'expiry_month', 'expiry_year', 'cvv', 'card_type'];
const NOTE_KEYS = ['content'];

const str = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const fieldValue = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

export const legacyKind = (row) => {
  const t = row?.entryType;
  return t === 'card' || t === 'note' ? t : 'password';
};

// v1 decrypt: CryptoJS passphrase AES, toString(Utf8); '' or a throw = failure.
export function legacyDecrypt(blob, password) {
  if (!blob || !password) return null;
  try {
    const text = CryptoJS.AES.decrypt(blob, password).toString(CryptoJS.enc.Utf8);
    return text || null;
  } catch {
    return null;
  }
}

// -> {ok:true, kind, text, data} | {ok:false, kind}
export function decryptLegacyRow(row, password) {
  const kind = legacyKind(row);
  const text = legacyDecrypt(row?.encryptedBlob, password);
  if (text === null) return { ok: false, kind };
  if (kind === 'card' || kind === 'note') {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, kind }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, kind };
    return { ok: true, kind, text, data };
  }
  return { ok: true, kind, text, data: null };
}

// "MM / YY" when month is 1-12 and year is 2 or 4 digits; otherwise the raw values.
export function formatExpiry(month, year) {
  const m = str(month).trim();
  const y = str(year).trim();
  if (!m && !y) return '';
  const mn = /^\d{1,2}$/.test(m) ? parseInt(m, 10) : NaN;
  if (mn >= 1 && mn <= 12 && /^(\d{2}|\d{4})$/.test(y)) {
    return `${String(mn).padStart(2, '0')} / ${y.slice(-2)}`;
  }
  return [m, y].filter(Boolean).join(' / ');
}

function fieldsBuilder() {
  const fields = [];
  return {
    fields,
    add(label, kind, value) { fields.push({ id: `f${fields.length + 1}`, label, kind, value: fieldValue(value) }); },
  };
}

const extraKeys = (data, known) => Object.keys(data).filter((k) => !known.includes(k));

function baseTags(category) {
  const c = str(category).trim();
  return c && c !== 'other' ? [c] : [];
}

// Plain v1-style input -> v2 item payload + type. Shared by the upgrade (rows from
// /legacy/entries) and by the v1 export import.
//   src = {serviceName, accountUsername, websiteUrl, category, isFavorite}
//   kind = password | card | note;  secret = decrypted password text;  data = card/note JSON
export function mapDecrypted(src, kind, secret, data) {
  const title = str(src.serviceName) || 'Untitled';
  const b = fieldsBuilder();
  let type;
  if (kind === 'card') {
    type = 'card';
    b.add('Cardholder', 'text', data.cardholder_name);
    b.add('Number', 'secret', data.card_number);
    b.add('Expiry', 'mono', formatExpiry(data.expiry_month, data.expiry_year));
    b.add('CVV', 'secret', data.cvv);
    b.add('Card type', 'text', data.card_type);
    for (const k of extraKeys(data, CARD_KEYS)) b.add(k, 'text', data[k]);
  } else if (kind === 'note') {
    type = 'secure_note';
    b.add('Content', 'multi', data.content);
    for (const k of extraKeys(data, NOTE_KEYS)) b.add(k, 'text', data[k]);
  } else {
    type = 'login';
    if (str(src.accountUsername)) b.add('Username', 'text', src.accountUsername);
    b.add('Password', 'secret', secret);
    if (str(src.websiteUrl)) b.add('Website', 'url', src.websiteUrl);
  }
  return {
    type,
    payload: toPayload({ title, fields: b.fields, notes: '', tags: baseTags(src.category), favorite: src.isFavorite === true }),
  };
}

export const UNDECRYPTABLE_NOTE =
  'This entry was encrypted with an older master password, so it could not be decrypted '
  + 'during the upgrade. Its original encrypted data is kept unchanged in the \'Original encrypted data\' field. '
  + 'If you remember the password it was saved with, the data can still be recovered.';

export function mapUndecryptable(row) {
  const b = fieldsBuilder();
  if (str(row.accountUsername)) b.add('Username', 'text', row.accountUsername);
  if (str(row.websiteUrl)) b.add('Website', 'url', row.websiteUrl);
  b.add('Original encrypted data', 'multi', str(row.encryptedBlob));
  const kind = legacyKind(row);
  return {
    type: 'secure_note',
    payload: toPayload({
      title: `${str(row.serviceName) || 'Untitled'} (could not decrypt)`,
      fields: b.fields,
      notes: `${UNDECRYPTABLE_NOTE}\nOriginal entry type: ${kind}.`,
      tags: [UNDECRYPTABLE_TAG, ...baseTags(row.category)],
      favorite: row.isFavorite === true,
    }),
  };
}

// One v1 row (+ its decrypt result) -> {legacyEntryId, type, payload, createdAt, updatedAt, undecryptable}
export function mapLegacyRow(row, dec) {
  const mapped = dec && dec.ok
    ? mapDecrypted(row, dec.kind, dec.text, dec.data)
    : mapUndecryptable(row);
  return {
    legacyEntryId: row.id,
    type: mapped.type,
    payload: mapped.payload,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? row.createdAt ?? null,
    undecryptable: !(dec && dec.ok),
  };
}

export function decryptLegacyRows(rows, password) {
  return (rows || []).map((row) => ({ row, dec: decryptLegacyRow(row, password) }));
}

export function summarizeLegacy(decrypted) {
  const byType = { password: 0, card: 0, note: 0 };
  let ok = 0;
  for (const { dec } of decrypted) {
    byType[dec.kind] += 1;
    if (dec.ok) ok += 1;
  }
  return { total: decrypted.length, decryptable: ok, undecryptable: decrypted.length - ok, byType };
}

// v1 export format for rows that decrypted, plus the raw row (as served by
// /legacy/entries, with `undecryptable: true`) for any that didn't.
export function buildLegacyBackup(decrypted, exportedAt = new Date().toISOString()) {
  return decrypted.map(({ row, dec }) => {
    if (!dec.ok) return { ...row, undecryptable: true };
    return {
      service_name: row.serviceName,
      account_username: row.accountUsername,
      password: dec.text,
      website_url: row.websiteUrl,
      category: row.category,
      entry_type: row.entryType || 'password',
      decrypted_data: dec.data || null,
      exported_at: exportedAt,
    };
  });
}
