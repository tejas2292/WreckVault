import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Lock, LogOut, Moon, Plus, Settings, Trash2, Wand2 } from 'lucide-react';
import { TYPE_KEYS, ITEM_TYPES } from '../../lib/itemTypes.js';
import { useSession } from '../../state/session.jsx';
import { useVault } from '../../state/vault.jsx';
import Sidebar from '../components/Sidebar.jsx';
import ItemList from '../components/ItemList.jsx';
import CommandPalette from '../components/CommandPalette.jsx';
import ItemDetail from './ItemDetail.jsx';
import ItemEditor, { TypePicker } from './ItemEditor.jsx';
import HealthView from './HealthView.jsx';
import GeneratorPage from './GeneratorPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import { computeHealth } from '../lib/health.js';
import { isRetired, searchText } from '../lib/format.js';
import { anyDialogOpen } from '../lib/dialogStack.js';
import { useNow } from '../lib/hooks.js';
import { getStoredTheme, nextTheme, resolvedTheme, setStoredTheme } from '../lib/theme.js';

const PAGE_VIEWS = new Set(['health', 'generator', 'settings']);

export default function VaultApp() {
  const { user, lock, logout } = useSession();
  const { items, collections, loading, error, refresh } = useVault();
  const now = useNow(60000);

  const [view, setViewState] = useState({ k: 'all' });
  const [selId, setSelId] = useState(null);
  const [query, setQuery] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [mDetail, setMDetail] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editor, setEditor] = useState(null);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme);
  const searchRef = useRef(null);
  const detailRef = useRef(null);

  const collectionsById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const present = useMemo(() => items.filter((i) => !i.deletedAt), [items]);
  const health = useMemo(() => computeHealth(items, now), [items, now]);

  const shown = useCallback((i) => showOld || !isRetired(i), [showOld]);

  const counts = useMemo(() => {
    const byCollection = {};
    for (const i of present) if (shown(i)) byCollection[i.collectionId] = (byCollection[i.collectionId] || 0) + 1;
    return {
      all: present.filter(shown).length,
      fav: present.filter((i) => i.favorite && shown(i)).length,
      trash: items.length - present.length,
      byCollection,
    };
  }, [items, present, shown]);

  const typeCounts = useMemo(
    () => TYPE_KEYS.map((t) => [t, present.filter((i) => i.type === t && !i.decryptError && shown(i)).length]).filter(([, n]) => n > 0),
    [present, shown],
  );
  const projects = useMemo(() => {
    const m = new Map();
    for (const i of present) if (i.project && shown(i)) m.set(i.project, (m.get(i.project) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [present, shown]);

  const isPage = PAGE_VIEWS.has(view.k);
  const isTrash = view.k === 'trash';

  const visible = useMemo(() => {
    let list = isTrash ? items.filter((i) => i.deletedAt) : present;
    if (!isTrash) {
      if (view.k === 'fav') list = list.filter((i) => i.favorite);
      else if (view.k === 'coll') list = list.filter((i) => i.collectionId === view.v);
      else if (view.k === 'type') list = list.filter((i) => i.type === view.v);
      else if (view.k === 'proj') list = list.filter((i) => i.project === view.v);
      list = list.filter(shown);
    }
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) list = list.filter((i) => terms.every((t) => searchText(i).includes(t)));
    if (isTrash) return [...list].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    return [...list].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  }, [items, present, view, isTrash, shown, query]);

  const selected = visible.find((i) => i.id === selId) || visible[0] || null;

  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [selected?.id, view.k]);

  const setView = useCallback((v) => {
    setViewState(v);
    setDrawer(false);
    setMDetail(false);
  }, []);

  const goto = useCallback(
    (id) => {
      const it = itemsById.get(id);
      if (!it) return;
      setViewState(it.deletedAt ? { k: 'trash' } : { k: 'all' });
      setQuery('');
      if (isRetired(it)) setShowOld(true);
      setSelId(id);
      setMDetail(true);
      setDrawer(false);
    },
    [itemsById],
  );

  const applyTheme = useCallback((t) => {
    setStoredTheme(t);
    setTheme(t);
  }, []);
  const toggleTheme = useCallback(() => applyTheme(nextTheme(theme)), [applyTheme, theme]);

  // Follow the system setting live while the theme is "system".
  useEffect(() => {
    if (theme !== 'system') return undefined;
    let mql;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const on = () => setTheme('system');
    mql.addEventListener?.('change', on);
    return () => mql.removeEventListener?.('change', on);
  }, [theme]);

  const focusSearch = useCallback(() => {
    if (PAGE_VIEWS.has(view.k)) setViewState({ k: 'all' });
    setMDetail(false);
    setDrawer(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [view.k]);

  // Global shortcuts: ⌘K / Ctrl+K palette, `/` search, Escape closes the drawer.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        if (anyDialogOpen() && !palette) return;
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (anyDialogOpen()) return;
      const tag = document.activeElement?.tagName;
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag || '') || document.activeElement?.isContentEditable;
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === 'Escape' && drawer) {
        setDrawer(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [palette, drawer, focusSearch]);

  const startNew = useCallback(() => {
    setDrawer(false);
    setPicker(true);
  }, []);

  const commands = useMemo(
    () => [
      { id: 'new', label: 'New item', icon: Plus, run: startNew },
      ...TYPE_KEYS.map((t) => ({ id: `new-${t}`, label: `New ${ITEM_TYPES[t].label.toLowerCase()}`, icon: Plus, run: () => setEditor({ type: t }) })),
      { id: 'health', label: 'Open health', icon: Activity, run: () => setView({ k: 'health' }) },
      { id: 'generator', label: 'Open generator', icon: Wand2, run: () => setView({ k: 'generator' }) },
      { id: 'trash', label: 'Open trash', icon: Trash2, run: () => setView({ k: 'trash' }) },
      { id: 'settings', label: 'Open settings', icon: Settings, run: () => setView({ k: 'settings' }) },
      { id: 'theme', label: 'Switch theme', icon: Moon, run: toggleTheme },
      { id: 'lock', label: 'Lock vault', icon: Lock, run: lock },
      { id: 'logout', label: 'Sign out', icon: LogOut, run: () => logout() },
    ],
    [startNew, setView, toggleTheme, lock, logout],
  );

  const viewTitle = (() => {
    switch (view.k) {
      case 'fav':
        return 'Favourites';
      case 'trash':
        return 'Trash';
      case 'coll':
        return collectionsById.get(view.v)?.name || 'Collection';
      case 'type':
        return ITEM_TYPES[view.v]?.label || 'Items';
      case 'proj':
        return view.v;
      default:
        return 'All items';
    }
  })();

  const emptyText = (() => {
    if (loading && !items.length) return 'Decrypting your vault…';
    if (query.trim()) {
      return (
        <>
          <strong>No items match “{query.trim()}”.</strong>
          Search covers names, projects, tags and fields that are not secret.
        </>
      );
    }
    if (isTrash) return 'The trash is empty. Items you delete stay here until you delete them forever.';
    if (view.k === 'fav') return 'No favourites yet. Star an item to keep it at the top.';
    if (!present.length) {
      return (
        <>
          <strong>Your vault is empty.</strong>
          Add your first item with New, or import a file in Settings.
        </>
      );
    }
    return 'Nothing here yet.';
  })();

  const defaultCollectionId = view.k === 'coll' ? view.v : null;
  const resolved = resolvedTheme(theme);

  let detail;
  if (view.k === 'health') {
    detail = <HealthView health={health} itemsById={itemsById} onGoto={goto} onMenu={() => setDrawer(true)} />;
  } else if (view.k === 'generator') {
    detail = <GeneratorPage onMenu={() => setDrawer(true)} />;
  } else if (view.k === 'settings') {
    detail = <SettingsPage theme={theme} onTheme={applyTheme} onMenu={() => setDrawer(true)} />;
  } else if (selected) {
    detail = (
      <ItemDetail
        key={selected.id}
        item={selected}
        collection={collectionsById.get(selected.collectionId)}
        collectionsById={collectionsById}
        itemsById={itemsById}
        allItems={items}
        now={now}
        onBack={() => setMDetail(false)}
        onEdit={() => setEditor({ item: selected })}
        onGoto={goto}
      />
    );
  } else {
    detail = (
      <div className="empty d-empty">
        {loading ? 'Decrypting your vault…' : isTrash ? 'Nothing in the trash.' : 'Select an item to see its details.'}
      </div>
    );
  }

  return (
    <div className="shell">
      <div className={`app ${isPage ? 'page-mode' : ''} ${drawer ? 'drawer' : ''} ${mDetail ? 'show-detail' : ''}`}>
        <Sidebar
          view={view}
          setView={setView}
          counts={counts}
          collections={collections}
          typeCounts={typeCounts}
          projects={projects}
          healthIssues={health.issueCount}
          user={user}
          theme={resolved}
          onToggleTheme={toggleTheme}
          onLock={lock}
          onSignOut={() => logout()}
        />
        <div className="drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
        <ItemList
          title={viewTitle}
          items={visible}
          selectedId={selected?.id}
          onSelect={(id) => {
            setSelId(id);
            setMDetail(true);
          }}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          onNew={startNew}
          onOpenPalette={() => setPalette(true)}
          showOld={showOld}
          onShowOld={setShowOld}
          onMenu={() => setDrawer(true)}
          empty={emptyText}
          isTrash={isTrash}
          now={now}
        />
        <section className="detail" ref={detailRef} aria-label="Details">
          {error && (
            <div className="banner b-bad" role="alert" style={{ margin: 'var(--s3) var(--s4) 0' }}>
              <span>{error}</span>
              <span className="banner-acts">
                <button type="button" className="linkish" onClick={() => refresh()}>
                  Reload
                </button>
              </span>
            </div>
          )}
          {detail}
        </section>
      </div>

      {picker && (
        <TypePicker
          onClose={() => setPicker(false)}
          onPick={(t) => {
            setPicker(false);
            setEditor({ type: t });
          }}
        />
      )}
      {editor && (
        <ItemEditor
          item={editor.item}
          type={editor.type}
          defaultCollectionId={defaultCollectionId}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            if (saved?.id) {
              if (view.k !== 'all' && !(view.k === 'coll' && view.v === saved.collectionId)) setViewState({ k: 'all' });
              setQuery('');
              if (isRetired(saved)) setShowOld(true);
              setSelId(saved.id);
              setMDetail(true);
            }
          }}
        />
      )}
      {palette && (
        <CommandPalette
          items={items}
          commands={commands}
          onGoto={goto}
          onClose={() => setPalette(false)}
        />
      )}
      {loading && items.length > 0 && <span className="sr-only" role="status">Refreshing</span>}
    </div>
  );
}
