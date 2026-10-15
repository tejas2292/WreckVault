import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bot, ChevronLeft, Download, File, History, Link2, Loader2, Pencil, RotateCcw, Star, Trash2,
} from 'lucide-react';
import { useVault } from '../../state/vault.jsx';
import Icon from '../components/Icon.jsx';
import Tile, { TypeIcon } from '../components/Tile.jsx';
import StatusChip from '../components/StatusChip.jsx';
import FieldRow from '../components/FieldRow.jsx';
import { useConfirm } from '../context/confirm.jsx';
import { useToast } from '../context/toast.jsx';
import { expiryOf } from '../lib/health.js';
import { fmtBytes, fmtDate, fmtDateTime, fmtDay, typeLabel } from '../lib/format.js';
import { collectionIcon } from '../lib/icons.js';
import { describeChange } from '../lib/diff.js';
import { downloadAttachment } from '../lib/files.js';

function Banners({ item, itemsById, onGoto, now }) {
  const out = [];
  if (item.decryptError) {
    out.push(
      <div key="dec" className="banner b-bad">
        <Icon icon={AlertTriangle} />
        <div>
          This item could not be decrypted, so its contents are not shown. It stays listed so nothing disappears without notice. If it is
          not needed, move it to the trash.
        </div>
      </div>,
    );
  }
  if (item.status === 'superseded' || item.status === 'revoked') {
    const by = item.supersededBy ? itemsById.get(item.supersededBy) : null;
    out.push(
      <div key="st" className="banner b-mute">
        <Icon icon={History} />
        <div>
          {item.status === 'superseded' ? (
            by ? (
              <>
                Superseded by{' '}
                <button type="button" className="linkish" onClick={() => onGoto(by.id)}>
                  {by.title}
                </button>
                .
              </>
            ) : (
              'Superseded.'
            )
          ) : (
            'Revoked.'
          )}{' '}
          Kept on record and hidden from lists unless Show superseded is on.
        </div>
      </div>,
    );
  } else if (!item.deletedAt && !item.decryptError) {
    const e = expiryOf(item, now);
    if (e && e.days <= 30) {
      const keyLike = item.type === 'api_key' || item.type === 'cloud_credential';
      const when =
        e.days < 0
          ? `${e.label} date passed ${Math.abs(e.days)} ${Math.abs(e.days) === 1 ? 'day' : 'days'} ago (${fmtDay(e.date)}).`
          : e.days === 0
            ? `${e.label} date is today.`
            : `${e.label} in ${e.days} ${e.days === 1 ? 'day' : 'days'} (${fmtDay(e.date)}).`;
      out.push(
        <div key="exp" className={`banner ${e.days < 0 ? 'b-bad' : 'b-warn'}`}>
          <Icon icon={AlertTriangle} />
          <div>
            {when} {keyLike ? 'Issue a replacement, then mark this one superseded.' : 'Renew it before then.'}
          </div>
        </div>,
      );
    }
  }
  return out;
}

function HistorySection({ item, collectionName }) {
  const { getHistory, restoreVersion } = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setVersions(await getHistory(item.id));
    } catch (err) {
      setError(err.message || 'Could not load the history. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v) => {
    const ok = await confirm({
      title: 'Restore this version?',
      message: `The item goes back to how it was on ${fmtDateTime(v.item.updatedAt || v.replacedAt)}. The current version is kept in the history, so you can switch back.`,
      confirmLabel: 'Restore version',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await restoreVersion(item.id, v.historyId);
      toast('Earlier version restored.');
      setVersions(await getHistory(item.id));
    } catch (err) {
      toast(err.message || 'Could not restore that version. Try again.', { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sec">
      <h3>
        <Icon icon={History} />
        History
        {versions && (
          <button type="button" className="sec-act link-btn" onClick={load} disabled={busy}>
            Refresh
          </button>
        )}
      </h3>
      {!versions ? (
        <div className="row">
          <button type="button" className="btn btn-sec" onClick={load} disabled={busy}>
            {busy ? <Icon icon={Loader2} className="spin" /> : <Icon icon={History} />}
            Show earlier versions
          </button>
          {error && <span className="err">{error}</span>}
        </div>
      ) : versions.length === 0 ? (
        <p className="quiet">No earlier versions. Each save keeps the version it replaces here.</p>
      ) : (
        <div className="log">
          {versions.map((v, i) => {
            const newer = i === 0 ? item : versions[i - 1].item;
            return (
              <div className="log-r" key={v.historyId}>
                <time dateTime={v.replacedAt}>{fmtDateTime(v.item.updatedAt || v.replacedAt)}</time>
                <span className="what">{describeChange(v.item, newer, collectionName)}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => restore(v)}
                  disabled={busy || v.item.decryptError}
                  aria-label={`Restore the version from ${fmtDateTime(v.item.updatedAt || v.replacedAt)}`}
                >
                  <Icon icon={RotateCcw} /> Restore
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const VIA = { mcp: 'MCP', cli: 'Command line' };

function ClaudeReads({ item }) {
  const { getReads } = useVault();
  const [reads, setReads] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setReads(await getReads(item.id));
    } catch (err) {
      setError(err.message || 'Could not load the Claude reads. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // Load once per item; the parent remounts this section for another item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sec">
      <h3>
        <Icon icon={Bot} />
        Claude reads
        {(reads || error) && (
          <button type="button" className="sec-act link-btn" onClick={load} disabled={busy}>
            Refresh
          </button>
        )}
      </h3>
      {error ? (
        <p className="err">{error}</p>
      ) : !reads ? (
        <p className="quiet">Loading…</p>
      ) : reads.length === 0 ? (
        <p className="quiet">Claude access starts once the ALFRED connector is set up.</p>
      ) : (
        <div className="log">
          {reads.map((r) => (
            <div className="log-r" key={r.id}>
              <time dateTime={r.createdAt || undefined}>{fmtDateTime(r.createdAt)}</time>
              <span className="what">
                {r.field === '*' ? 'All fields' : r.field === 'unknown' ? 'Unknown field' : r.field}
                {' · '}
                {r.agentName || 'Deleted device'}
              </span>
              <span className="via" title={r.host || undefined}>
                {VIA[r.via] || r.via || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ItemDetail({ item, collection, collectionsById, itemsById, allItems, onBack, onEdit, onGoto, now }) {
  const { toggleFavorite, trashItem, restoreItem, deleteForever } = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const [revealed, setRevealed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(err.message || 'That did not work. Try again.', { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const toggleReveal = (id) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onDeleteForever = async () => {
    const ok = await confirm({
      title: 'Delete forever?',
      message: `“${item.title}” and all its earlier versions will be erased. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
    });
    if (ok) run(() => deleteForever(item.id), 'Item deleted forever.');
  };

  const collectionName = (id) => collectionsById.get(id)?.name || 'another collection';
  const fields = (item.fields || []).filter((f) => f.value !== '' && f.value != null);

  const linkIds = [...new Set([...(item.links || []), ...allItems.filter((o) => o.id !== item.id && !o.deletedAt && (o.links || []).includes(item.id)).map((o) => o.id)])];

  const trashed = !!item.deletedAt;

  return (
    <>
      <div className="d-top">
        <button type="button" className="ib only-phone" onClick={onBack} aria-label="Back to the list">
          <Icon icon={ChevronLeft} />
        </button>
        <span className="crumb">
          <Icon icon={collectionIcon(collection)} />
          <span>
            {collection?.name || 'Unknown collection'}
            {item.project ? ` / ${item.project}` : ''}
          </span>
        </span>
        <span className="sp" />
        {trashed ? (
          <>
            <button type="button" className="btn btn-sec" onClick={() => run(() => restoreItem(item.id), 'Item restored.')} disabled={busy}>
              <Icon icon={RotateCcw} /> Restore
            </button>
            <button type="button" className="btn btn-danger-soft" onClick={onDeleteForever} disabled={busy}>
              <Icon icon={Trash2} /> Delete forever
            </button>
          </>
        ) : (
          <>
            {!item.decryptError && (
              <>
                <button
                  type="button"
                  className={`ib ${item.favorite ? 'on' : ''}`}
                  onClick={() => run(() => toggleFavorite(item.id), item.favorite ? 'Removed from favourites.' : 'Added to favourites.')}
                  aria-pressed={!!item.favorite}
                  aria-label={item.favorite ? 'Remove from favourites' : 'Add to favourites'}
                  title="Favourite"
                  disabled={busy}
                >
                  <Icon icon={Star} />
                </button>
                <button type="button" className="btn btn-sec" onClick={onEdit} disabled={busy}>
                  <Icon icon={Pencil} /> Edit
                </button>
              </>
            )}
            <button
              type="button"
              className="ib"
              onClick={() => run(() => trashItem(item.id), 'Moved to the trash.')}
              aria-label="Move to the trash"
              title="Move to the trash"
              disabled={busy}
            >
              <Icon icon={Trash2} />
            </button>
          </>
        )}
      </div>

      <div className="d-body">
        <div className="d-head">
          <Tile item={item} lg />
          <div>
            <h1>{item.title || 'Untitled'}</h1>
            <div className="d-meta">
              <span>{typeLabel(item.type)}</span>
              <StatusChip item={item} now={now} />
              {collection?.agentAccess && (
                <span className="chip c-ai" title="Items in this collection are readable by Claude Code once the ALFRED connector is set up">
                  <Icon icon={Bot} />
                  Claude can read
                </span>
              )}
              {(item.tags || []).map((t) => (
                <span key={t} className="chip c-mute">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {trashed && (
          <div className="banner b-mute">
            <Icon icon={Trash2} />
            <div>In the trash since {fmtDate(item.deletedAt)}. Restore it to use it again, or delete it forever.</div>
          </div>
        )}
        <Banners item={item} itemsById={itemsById} onGoto={onGoto} now={now} />

        {fields.length > 0 && (
          <div className="sec">
            <h3>Fields</h3>
            <div className="fields">
              {fields.map((f) => (
                <FieldRow key={f.id} field={f} revealed={revealed.has(f.id)} onToggleReveal={() => toggleReveal(f.id)} />
              ))}
            </div>
          </div>
        )}

        {item.notes && (
          <div className="sec">
            <h3>Notes</h3>
            <div className="notes">{item.notes}</div>
          </div>
        )}

        {(item.attachments || []).length > 0 && (
          <div className="sec">
            <h3>Files</h3>
            <div className="att">
              {item.attachments.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className="att-i"
                  onClick={() => {
                    try {
                      downloadAttachment(a);
                    } catch {
                      toast(`Could not save ${a.name}. The file data may be damaged.`, { tone: 'bad' });
                    }
                  }}
                  aria-label={`Download ${a.name}`}
                >
                  <Icon icon={File} />
                  <span>{a.name}</span>
                  <small>{fmtBytes(a.size)}</small>
                  <Icon icon={Download} />
                </button>
              ))}
            </div>
          </div>
        )}

        {linkIds.length > 0 && (
          <div className="sec">
            <h3>
              <Icon icon={Link2} />
              Linked items
            </h3>
            <div className="links">
              {linkIds.map((id) => {
                const l = itemsById.get(id);
                if (!l) {
                  return (
                    <span key={id} className="link-i missing">
                      <span>Deleted item</span>
                    </span>
                  );
                }
                return (
                  <button type="button" key={id} className="link-i" onClick={() => onGoto(l.id)}>
                    <TypeIcon type={l.type} />
                    <span>{l.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {collection?.agentAccess && !item.decryptError && <ClaudeReads key={item.id} item={item} />}

        {!item.decryptError && <HistorySection key={item.updatedAt} item={item} collectionName={collectionName} />}

        <div className="d-foot">
          {item.createdAt && <span>Created {fmtDate(item.createdAt)}</span>}
          {item.updatedAt && <span>Updated {fmtDate(item.updatedAt)}</span>}
          <span className="mono">{item.id}</span>
        </div>
      </div>
    </>
  );
}
