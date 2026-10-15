import { Menu, Plus, Search, Star } from 'lucide-react';
import Icon from './Icon.jsx';
import Tile from './Tile.jsx';
import StatusChip from './StatusChip.jsx';
import { subtitle, isRetired } from '../lib/format.js';

export default function ItemList({
  title, items, selectedId, onSelect, query, onQuery, searchRef, onNew, onOpenPalette, showOld, onShowOld,
  onMenu, empty, isTrash, now,
}) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  return (
    <section className="list" aria-label={title}>
      <div className="list-top">
        <div className="row">
          <button type="button" className="ib only-narrow" onClick={onMenu} aria-label="Open navigation">
            <Icon icon={Menu} />
          </button>
          <label className="search">
            <Icon icon={Search} />
            <span className="sr-only">Search items</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search items"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.preventDefault();
                  onQuery('');
                }
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <kbd
              role="button"
              tabIndex={-1}
              title="Open the command palette"
              onClick={(e) => {
                e.preventDefault();
                onOpenPalette();
              }}
            >
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </label>
          <button type="button" className="btn btn-pri" onClick={onNew} aria-label="New item">
            <Icon icon={Plus} />
            <span>New</span>
          </button>
        </div>
        <div className="list-head">
          <h2>{title}</h2>
          <span>{items.length}</span>
          {!isTrash && (
            <label className="toggle check">
              <input type="checkbox" checked={showOld} onChange={(e) => onShowOld(e.target.checked)} />
              Show superseded
            </label>
          )}
        </div>
      </div>
      <div className="items">
        {items.length ? (
          items.map((it) => (
            <button
              type="button"
              key={it.id}
              className={`item ${it.id === selectedId ? 'on' : ''} ${isRetired(it) ? 'dim' : ''}`}
              onClick={() => onSelect(it.id)}
              aria-current={it.id === selectedId ? 'true' : undefined}
            >
              <Tile item={it} />
              <span className="it-b">
                <span className="it-t">{it.title || 'Untitled'}</span>
                <span className="it-s">{subtitle(it)}</span>
              </span>
              <span className="it-r">
                <StatusChip item={it} now={now} />
                <span className="it-star">{it.favorite && <Icon icon={Star} label="Favourite" />}</span>
              </span>
            </button>
          ))
        ) : (
          <div className="empty">{empty}</div>
        )}
      </div>
    </section>
  );
}
