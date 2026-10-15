import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import Tile from './Tile.jsx';
import { searchText, subtitle, typeLabel } from '../lib/format.js';

// ⌘K / Ctrl+K: jump to an item or run a command. Arrow keys move, Enter runs, Escape closes.
export default function CommandPalette({ items, commands, onGoto, onClose }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listId = useId();

  const rows = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (text) => terms.every((t) => text.includes(t));
    const its = items
      .filter((i) => !i.deletedAt && !i.decryptError && match(searchText(i)))
      .slice(0, terms.length ? 8 : 6)
      .map((i) => ({ kind: 'item', id: `i-${i.id}`, item: i }));
    const cmds = commands.filter((c) => match(c.label.toLowerCase())).map((c) => ({ kind: 'cmd', id: `c-${c.id}`, cmd: c }));
    return [...its, ...cmds];
  }, [q, items, commands]);

  const active = Math.min(idx, Math.max(0, rows.length - 1));

  const run = (row) => {
    if (!row) return;
    onClose();
    if (row.kind === 'item') onGoto(row.item.id);
    else row.cmd.run();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((active + 1) % Math.max(1, rows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((active - 1 + rows.length) % Math.max(1, rows.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(rows[active]);
    }
  };

  const firstCmd = rows.findIndex((r) => r.kind === 'cmd');
  const optId = (i) => `${listId}-${i}`;

  return (
    <Dialog bare onClose={onClose} ariaLabel="Command palette" className="palette">
      <div className="pal-in">
        <Icon icon={Search} />
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows.length ? optId(active) : undefined}
          aria-label="Jump to an item or run a command"
          placeholder="Jump to an item or run a command"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={onKey}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <kbd>esc</kbd>
      </div>
      <div className="pal-l" id={listId} role="listbox" aria-label="Results">
        {rows.length === 0 && <div className="empty">Nothing matches “{q}”.</div>}
        {rows.map((r, i) => (
          <div key={r.id} role="presentation">
            {i === 0 && r.kind === 'item' && <div className="pal-g">Items</div>}
            {i === firstCmd && <div className="pal-g">Commands</div>}
            <div
              id={optId(i)}
              role="option"
              aria-selected={i === active}
              className={`pal-i ${i === active ? 'on' : ''}`}
              onMouseMove={() => i !== active && setIdx(i)}
              onClick={() => run(r)}
            >
              {r.kind === 'item' ? (
                <>
                  <Tile item={r.item} />
                  <span className="it-b">
                    <span className="it-t">{r.item.title}</span>
                    <span className="it-s">{subtitle(r.item)}</span>
                  </span>
                  <span className="k">{typeLabel(r.item.type)}</span>
                </>
              ) : (
                <>
                  <span className="tile">
                    <Icon icon={r.cmd.icon} />
                  </span>
                  <span className="it-b">
                    <span className="it-t">{r.cmd.label}</span>
                  </span>
                  {r.cmd.hint && <span className="k">{r.cmd.hint}</span>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
