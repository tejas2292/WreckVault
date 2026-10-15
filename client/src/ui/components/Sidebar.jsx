import { Activity, Hash, LayoutGrid, Lock, LogOut, Moon, Settings, Star, Sun, Trash2, Wand2 } from 'lucide-react';
import { ITEM_TYPES } from '../../lib/itemTypes.js';
import Icon from './Icon.jsx';
import VaultMark from './VaultMark.jsx';
import { TypeIcon } from './Tile.jsx';
import { initials } from '../lib/format.js';
import { collectionIcon } from '../lib/icons.js';

function Nav({ on, icon, label, onClick, children }) {
  return (
    <button type="button" className={`nav ${on ? 'on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
      {children}
    </button>
  );
}

const Count = ({ n }) => <span className="n">{n}</span>;

export default function Sidebar({
  view, setView, counts, collections, typeCounts, projects, healthIssues, user, theme, onToggleTheme, onLock, onSignOut,
}) {
  const is = (k, v) => view.k === k && (view.v ?? null) === (v ?? null);
  const dark = theme === 'dark';
  return (
    <aside className="side" aria-label="Vault navigation">
      <div className="brand">
        <span className="mark">
          <VaultMark />
        </span>
        <div>
          <b>WreckVault</b>
          <small>{user?.username ? `${user.username} · unlocked` : 'Unlocked'}</small>
        </div>
      </div>

      <nav className="side-scroll">
        <div className="grp">
          <Nav on={is('all')} icon={<Icon icon={LayoutGrid} />} label="All items" onClick={() => setView({ k: 'all' })}>
            <Count n={counts.all} />
          </Nav>
          <Nav on={is('fav')} icon={<Icon icon={Star} />} label="Favourites" onClick={() => setView({ k: 'fav' })}>
            <Count n={counts.fav} />
          </Nav>
          <Nav on={is('health')} icon={<Icon icon={Activity} />} label="Health" onClick={() => setView({ k: 'health' })}>
            {healthIssues > 0 && <span className="dot" title={`${healthIssues} need attention`} aria-label={`${healthIssues} need attention`} />}
          </Nav>
          <Nav on={is('trash')} icon={<Icon icon={Trash2} />} label="Trash" onClick={() => setView({ k: 'trash' })}>
            {counts.trash > 0 && <Count n={counts.trash} />}
          </Nav>
        </div>

        {collections.length > 0 && (
          <div className="grp">
            <h4>Collections</h4>
            {collections.map((c) => (
              <Nav key={c.id} on={is('coll', c.id)} icon={<Icon icon={collectionIcon(c)} />} label={c.name} onClick={() => setView({ k: 'coll', v: c.id })}>
                {c.agentAccess && (
                  <span className="pill-ai" title="Claude Code can read this collection once the ALFRED connector is set up">
                    Claude
                  </span>
                )}
                <Count n={counts.byCollection[c.id] || 0} />
              </Nav>
            ))}
          </div>
        )}

        {typeCounts.length > 0 && (
          <div className="grp">
            <h4>Types</h4>
            {typeCounts.map(([t, n]) => (
              <Nav key={t} on={is('type', t)} icon={<TypeIcon type={t} />} label={ITEM_TYPES[t]?.label || t} onClick={() => setView({ k: 'type', v: t })}>
                <Count n={n} />
              </Nav>
            ))}
          </div>
        )}

        {projects.length > 0 && (
          <div className="grp">
            <h4>Projects</h4>
            {projects.map(([p, n]) => (
              <Nav key={p} on={is('proj', p)} icon={<Icon icon={Hash} />} label={p} onClick={() => setView({ k: 'proj', v: p })}>
                <Count n={n} />
              </Nav>
            ))}
          </div>
        )}

        <div className="grp">
          <h4>Tools</h4>
          <Nav on={is('generator')} icon={<Icon icon={Wand2} />} label="Generator" onClick={() => setView({ k: 'generator' })} />
          <Nav on={is('settings')} icon={<Icon icon={Settings} />} label="Settings" onClick={() => setView({ k: 'settings' })} />
        </div>
      </nav>

      <div className="side-foot">
        <span className="avatar" aria-hidden="true">
          {user?.profileImage ? <img src={user.profileImage} alt="" /> : initials(user?.username)}
        </span>
        <span className="who">{user?.username}</span>
        <button type="button" className="ib" onClick={onToggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Switch theme">
          <Icon icon={dark ? Sun : Moon} />
        </button>
        <button type="button" className="ib" onClick={onLock} aria-label="Lock vault" title="Lock vault">
          <Icon icon={Lock} />
        </button>
        <button type="button" className="ib" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <Icon icon={LogOut} />
        </button>
      </div>
    </aside>
  );
}
