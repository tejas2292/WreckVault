// Plain-language summary of what changed between two versions of an item. Never includes values.
import { typeLabel } from './format.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function describeChange(older, newer, collectionName = (id) => id) {
  if (!older || !newer) return '';
  if (older.decryptError) return 'This version could not be decrypted';
  const parts = [];
  if (older.type !== newer.type) parts.push(`Type was ${typeLabel(older.type)}`);
  if (older.title !== newer.title) parts.push(`Title was “${older.title}”`);
  if (older.collectionId !== newer.collectionId) parts.push(`Was in ${collectionName(older.collectionId)}`);

  const oldF = new Map((older.fields || []).map((f) => [f.label, f]));
  const newF = new Map((newer.fields || []).map((f) => [f.label, f]));
  const changed = [];
  const removed = [];
  const added = [];
  for (const [label, f] of oldF) {
    const n = newF.get(label);
    if (!n) removed.push(label);
    else if (n.value !== f.value || n.kind !== f.kind) changed.push(label);
  }
  for (const label of newF.keys()) if (!oldF.has(label)) added.push(label);
  if (changed.length) parts.push(`${changed.join(', ')} changed`);
  if (added.length) parts.push(`${added.join(', ')} added`);
  if (removed.length) parts.push(`${removed.join(', ')} removed`);

  if (older.notes !== newer.notes) parts.push('Notes edited');
  if (!same(older.tags, newer.tags)) parts.push('Tags changed');
  if (older.project !== newer.project) parts.push(older.project ? `Project was ${older.project}` : 'Project set');
  if (older.status !== newer.status) parts.push(`Status was ${older.status}`);
  if (!same(older.links, newer.links)) parts.push('Links changed');
  if (!same((older.attachments || []).map((a) => a.id), (newer.attachments || []).map((a) => a.id))) parts.push('Files changed');
  if (older.favorite !== newer.favorite) parts.push(older.favorite ? 'Was a favourite' : 'Favourite added');
  return parts.length ? parts.join(' · ') : 'No visible changes';
}
