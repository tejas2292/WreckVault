// Vault health: pure functions over DecryptedItem[]. No React, no I/O.
import { EXPIRY_LABELS } from '../../lib/itemTypes.js';
import { daysUntil, isLive, isRetired, primaryPassword } from './format.js';
import { passwordScore } from './strength.js';

export const EXPIRY_WINDOW_DAYS = 30;
const EXPIRY_SET = new Set(EXPIRY_LABELS.map((l) => l.toLowerCase()));

// The earliest expiry / rotation deadline on an item, or null.
export function expiryOf(item, now = Date.now()) {
  let best = null;
  for (const f of item.fields || []) {
    if (f.kind !== 'date' || !f.value) continue;
    if (!EXPIRY_SET.has(String(f.label || '').trim().toLowerCase())) continue;
    const days = daysUntil(f.value, now);
    if (days === null) continue;
    if (!best || days < best.days) best = { label: f.label, date: f.value, days };
  }
  return best;
}

// The one status chip shown in lists and in the detail header.
export function statusOf(item, now = Date.now()) {
  if (item.decryptError) return { tone: 'bad', text: 'Unreadable' };
  if (item.status === 'superseded') return { tone: 'mute', text: 'Superseded' };
  if (item.status === 'revoked') return { tone: 'mute', text: 'Revoked' };
  const e = expiryOf(item, now);
  if (!e) return null;
  if (e.days < 0) return { tone: 'bad', text: /rotate/i.test(e.label) ? 'Rotation overdue' : 'Expired' };
  if (e.days === 0) return { tone: 'warn', text: 'Due today' };
  if (e.days <= EXPIRY_WINDOW_DAYS) return { tone: 'warn', text: `${e.days}d left` };
  return null;
}

export function computeHealth(items, now = Date.now()) {
  const live = items.filter(isLive);
  const active = live.filter((i) => !isRetired(i));

  const due = [];
  for (const item of active) {
    const e = expiryOf(item, now);
    if (e && e.days <= EXPIRY_WINDOW_DAYS) due.push({ item, expiry: e });
  }
  due.sort((a, b) => a.expiry.days - b.expiry.days);
  const overdue = due.filter((d) => d.expiry.days < 0);
  const expiring = due.filter((d) => d.expiry.days >= 0);

  const logins = active.filter((i) => i.type === 'login');
  const byPassword = new Map();
  for (const item of logins) {
    const pw = primaryPassword(item);
    if (!pw) continue;
    if (!byPassword.has(pw)) byPassword.set(pw, []);
    byPassword.get(pw).push(item);
  }
  const reusedGroups = [...byPassword.values()].filter((g) => g.length > 1);
  const reused = reusedGroups.flatMap((g, gi) => g.map((item) => ({ item, group: gi, count: g.length })));

  const weak = logins
    .map((item) => ({ item, score: passwordScore(primaryPassword(item)), has: !!primaryPassword(item) }))
    .filter((x) => x.has && x.score < 2);

  const retired = live.filter(isRetired);

  return {
    due,
    expiring,
    overdue,
    reused,
    reusedGroups: reusedGroups.length,
    weak,
    retired,
    issueCount: due.length + reused.length + weak.length,
  };
}
