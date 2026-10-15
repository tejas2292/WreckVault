// Formatting and small item helpers shared by the screens.
import { ITEM_TYPES } from '../../lib/itemTypes.js';

export const DAY_MS = 864e5;

// 'yyyy-mm-dd' -> local midnight Date, or null.
export function parseDay(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysUntil(iso, now = Date.now()) {
  const d = parseDay(iso);
  if (!d) return null;
  const today = new Date(now);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t0) / DAY_MS);
}

export function fmtDay(iso) {
  const d = parseDay(iso);
  if (!d) return iso || '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtDaysRelative(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n < 0 ? `${Math.abs(n)} days ago` : `in ${n} days`;
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

export function typeLabel(type) {
  return ITEM_TYPES[type]?.label || 'Item';
}

export function fieldByLabel(item, label) {
  const re = typeof label === 'string' ? null : label;
  return (item.fields || []).find((f) => (re ? re.test(f.label || '') : (f.label || '').toLowerCase() === label.toLowerCase()));
}

export function fieldValue(item, label) {
  return fieldByLabel(item, label)?.value || '';
}

export function isPasswordField(f) {
  return f && f.kind === 'secret' && /pass(word|phrase)/i.test(f.label || '');
}

export function primaryPassword(item) {
  const f = (item.fields || []).find(isPasswordField);
  return f ? f.value || '' : '';
}

export function isRetired(item) {
  return item.status === 'superseded' || item.status === 'revoked';
}

export function isLive(item) {
  return !item.deletedAt && !item.decryptError;
}

const SUBTITLE_FIELD = {
  login: 'Username', api_key: 'Scope', database: 'Engine', server: 'LAN address', vpn: 'Gateway',
  cloud_credential: 'Access key ID', webhook: 'Posts to', wifi: 'Network', license: 'Product',
  identity: 'Email',
};

export function subtitle(item) {
  if (item.decryptError) return 'Could not be decrypted';
  if (item.type === 'card') {
    const n = fieldValue(item, 'Number').replace(/\s+/g, '');
    return n ? `Card ending ${n.slice(-4)}` : 'Card';
  }
  if (item.type === 'ssh_host') {
    const u = fieldValue(item, 'User');
    const h = fieldValue(item, 'Host');
    if (u && h) return `${u}@${h}`;
    if (h) return h;
  }
  if (item.type === 'secure_note') {
    return (item.notes || '').split('\n')[0].slice(0, 80) || 'Secure note';
  }
  const pick = SUBTITLE_FIELD[item.type];
  const v = pick && fieldValue(item, pick);
  if (v) return v;
  const firstPlain = (item.fields || []).find((f) => ['text', 'mono', 'url', 'ref'].includes(f.kind) && f.value);
  return firstPlain ? firstPlain.value : typeLabel(item.type);
}

// Only http(s) and mailto links become clickable; anything else is shown as text.
export function safeHref(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /^mailto:/i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(v)) return `https://${v}`;
  return null;
}

export function displayUrl(value) {
  return String(value || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// Text the list search matches against: names, projects, tags, type, and non-secret fields.
export function searchText(item) {
  const parts = [item.title, item.project, typeLabel(item.type), ...(item.tags || [])];
  for (const f of item.fields || []) {
    if (['text', 'mono', 'url', 'ref'].includes(f.kind)) parts.push(f.value);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function initials(name) {
  return (String(name || '?').trim()[0] || '?').toUpperCase();
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
