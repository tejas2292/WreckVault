import { Activity } from 'lucide-react';
import Tile from '../components/Tile.jsx';
import PageTop from './PageTop.jsx';
import { typeLabel } from '../lib/format.js';

function Row({ item, why, onGoto }) {
  return (
    <button type="button" className="h-r" onClick={() => onGoto(item.id)}>
      <Tile item={item} />
      <span className="it-b">
        <span className="it-t">{item.title}</span>
        <span className="it-s">
          {typeLabel(item.type)}
          {item.project ? ` · ${item.project}` : ''}
        </span>
      </span>
      <span className="why">{why}</span>
    </button>
  );
}

function Section({ id, title, rows, empty }) {
  return (
    <div className="sec" id={id}>
      <h3>{title}</h3>
      <div className="h-list">{rows.length ? rows : <div className="empty">{empty}</div>}</div>
    </div>
  );
}

const jump = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

export default function HealthView({ health, itemsById, onGoto, onMenu }) {
  const { due, reused, weak, retired } = health;
  const dueText = ({ expiry: e }) =>
    e.days < 0 ? `${e.label} passed ${Math.abs(e.days)}d ago` : e.days === 0 ? `${e.label} today` : `${e.label} in ${e.days}d`;
  return (
    <>
      <PageTop icon={Activity} title="Health" onMenu={onMenu} />
      <div className="d-body wide">
        <div className="d-head">
          <div>
            <h1>Vault health</h1>
            <p>Keys about to expire or past their rotation date, passwords used on more than one login or too weak, and superseded items still on record.</p>
          </div>
        </div>
        <div className="score">
          <a className={`sc ${due.length ? 'warn' : 'ok'}`} href="#h-due" onClick={jump('h-due')}>
            <b>{due.length}</b>
            <span>Expiring or overdue</span>
          </a>
          <a className={`sc ${reused.length ? 'bad' : 'ok'}`} href="#h-reused" onClick={jump('h-reused')}>
            <b>{reused.length}</b>
            <span>Reused passwords</span>
          </a>
          <a className={`sc ${weak.length ? 'bad' : 'ok'}`} href="#h-weak" onClick={jump('h-weak')}>
            <b>{weak.length}</b>
            <span>Weak passwords</span>
          </a>
          <a className="sc" href="#h-old" onClick={jump('h-old')}>
            <b>{retired.length}</b>
            <span>Superseded or revoked</span>
          </a>
        </div>
        <Section
          id="h-due"
          title="Expiring in 30 days or overdue"
          empty="Nothing is due in the next 30 days."
          rows={due.map((d) => <Row key={d.item.id} item={d.item} why={dueText(d)} onGoto={onGoto} />)}
        />
        <Section
          id="h-reused"
          title="Same password on more than one login"
          empty="No login shares its password with another."
          rows={reused.map((r) => <Row key={r.item.id} item={r.item} why={`Shared with ${r.count - 1} other ${r.count - 1 === 1 ? 'login' : 'logins'}`} onGoto={onGoto} />)}
        />
        <Section
          id="h-weak"
          title="Weak passwords"
          empty="No weak login passwords."
          rows={weak.map((w) => <Row key={w.item.id} item={w.item} why="Short or easy to guess" onGoto={onGoto} />)}
        />
        <Section
          id="h-old"
          title="Superseded or revoked, kept on record"
          empty="Nothing is superseded or revoked."
          rows={retired.map((i) => {
            const by = i.supersededBy ? itemsById.get(i.supersededBy) : null;
            const why = i.status === 'revoked' ? 'Revoked' : by ? `Replaced by ${by.title}` : 'Superseded';
            return <Row key={i.id} item={i} why={why} onGoto={onGoto} />;
          })}
        />
      </div>
    </>
  );
}
