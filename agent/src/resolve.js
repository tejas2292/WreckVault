// Item and field resolution (spec §8.5).
//   <item>  = item id, or a title matched case-insensitively: an exact match wins; otherwise a
//             unique substring; more than one candidate → ambiguous (exit 2, candidates listed).
//   [field] = field label, case-insensitive; default = the first `secret` field.
import { WvError, EXIT } from './errors.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();
const describe = (it) => `  ${it.title}  (${it.type}${it.project ? `, ${it.project}` : ''}${it.status !== 'active' ? `, ${it.status}` : ''})  ${it.id}`;

function pick(cands, query) {
  if (cands.length === 1) return cands[0];
  // Tie-break: when exactly one candidate is still active, superseded/revoked copies of the
  // same credential do not make the name ambiguous.
  const active = cands.filter((c) => c.status === 'active');
  if (active.length === 1) return active[0];
  throw new WvError(
    `"${query}" matches ${cands.length} items. Use a longer title or the id:\n${cands.map(describe).join('\n')}`,
    EXIT.NOT_FOUND,
    { candidates: cands.map((c) => ({ id: c.id, title: c.title, type: c.type, project: c.project, status: c.status })) },
  );
}

export function resolveItem(items, query) {
  const q = norm(query);
  if (!q) throw new WvError('Name an item (its title or id).', EXIT.NOT_FOUND);
  const byId = items.find((it) => norm(it.id) === q);
  if (byId) return byId;
  const exact = items.filter((it) => norm(it.title) === q);
  if (exact.length) return pick(exact, query);
  const sub = items.filter((it) => norm(it.title).includes(q));
  if (sub.length) return pick(sub, query);
  throw new WvError(`No item matches "${query}". Run \`wv ls\` to see what this device can read.`, EXIT.NOT_FOUND);
}

export function resolveField(item, label) {
  const fields = item.fields || [];
  if (label === undefined || label === null || label === '') {
    const f = fields.find((x) => x.kind === 'secret');
    if (!f) {
      throw new WvError(`"${item.title}" has no secret field. Name one of: ${fields.map((x) => x.label).join(', ') || '(no fields)'}.`, EXIT.NOT_FOUND);
    }
    return f;
  }
  const f = fields.find((x) => norm(x.label) === norm(label));
  if (!f) {
    throw new WvError(`"${item.title}" has no field "${label}". Fields: ${fields.map((x) => x.label).join(', ') || '(none)'}.`, EXIT.NOT_FOUND);
  }
  return f;
}
