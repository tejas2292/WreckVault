import { statusOf } from '../lib/health.js';

export default function StatusChip({ item, now }) {
  const s = statusOf(item, now);
  if (!s) return null;
  return <span className={`chip c-${s.tone}`}>{s.text}</span>;
}
