// Settings → Claude access (spec §8.4): devices that can read (and optionally write) chosen
// collections without the master password.
import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Copy, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useVault } from '../../state/vault.jsx';
import Dialog from '../components/Dialog.jsx';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../context/confirm.jsx';
import { useToast } from '../context/toast.jsx';
import { copyText } from '../../lib/clipboard.js';
import { fmtDate, fmtDateTime } from '../lib/format.js';

function ConnectDialog({ collections, onClose, onCreated }) {
  const { createAgent } = useVault();
  const toast = useToast();
  const usable = collections.filter((c) => !c.keyError);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState(() => new Set(usable.filter((c) => c.kind === 'alfred').map((c) => c.id)));
  const [canWrite, setCanWrite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('');

  const personalTicked = usable.some((c) => c.kind === 'personal' && chosen.has(c.id));

  const toggle = (id) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Give the device a name.');
    if (!chosen.size) return setError('Choose at least one collection.');
    setError('');
    setBusy(true);
    try {
      const res = await createAgent({ name, collectionIds: usable.filter((c) => chosen.has(c.id)).map((c) => c.id), canWrite });
      setConnection(res.connectionString);
      onCreated(res.agent);
    } catch (err) {
      setError(err.message || 'Could not connect the device. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    let ok = false;
    try {
      ok = await copyText(connection);
    } catch {
      ok = false;
    }
    if (ok) toast('Connection string copied.');
    else toast('Could not copy the connection string. Select it and copy it by hand.', { tone: 'bad' });
  };

  if (connection) {
    return (
      <Dialog
        title="Device connected"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn-sec" onClick={copy}>
              <Icon icon={Copy} /> Copy
            </button>
            <button type="button" className="btn btn-pri" onClick={onClose} data-autofocus>
              Done
            </button>
          </>
        }
      >
        <p>On that machine, run <code className="mono">wv login</code> and paste this when asked. It is shown only once.</p>
        <div className="conn-str mono" aria-label="Connection string">
          {connection}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      title="Connect a device"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-sec" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-pri" disabled={busy}>
            {busy && <Icon icon={Loader2} className="spin" />} Create connection
          </button>
        </>
      }
    >
      <p>The device decrypts what it reads on its own, so it never needs your master password.</p>
      <div className="fld">
        <label htmlFor="ag-name">Device name</label>
        <input
          id="ag-name"
          className="inp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. MacBook Air"
          maxLength={60}
          autoComplete="off"
          disabled={busy}
          data-autofocus
        />
      </div>
      <fieldset className="fld opt-list">
        <legend className="lbl">Collections</legend>
        {usable.map((c) => (
          <label key={c.id} className="check">
            <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} disabled={busy} />
            {c.name}
          </label>
        ))}
        {personalTicked && (
          <div className="banner b-warn">
            <Icon icon={AlertTriangle} />
            <div>Claude would be able to read your personal passwords.</div>
          </div>
        )}
      </fieldset>
      <fieldset className="fld opt-list">
        <legend className="lbl">Permission</legend>
        <label className="check">
          <input type="radio" name="ag-perm" checked={!canWrite} onChange={() => setCanWrite(false)} disabled={busy} />
          Read only
        </label>
        <label className="check">
          <input type="radio" name="ag-perm" checked={canWrite} onChange={() => setCanWrite(true)} disabled={busy} />
          Read and write
        </label>
      </fieldset>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

export default function ClaudeAccess() {
  const { collections, listAgents, revokeAgent } = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const [agents, setAgents] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setAgents(await listAgents());
    } catch (err) {
      setError(err.message || 'Could not load the connected devices. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // Load once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const names = (ids) => {
    const list = ids.map((id) => collections.find((c) => c.id === id)?.name || 'Deleted collection');
    return list.length ? list.join(', ') : 'No collections';
  };

  const revoke = async (a) => {
    const ok = await confirm({
      title: `Revoke ${a.name}?`,
      message: 'The device stops working at once. To connect it again, create a new connection.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      const row = await revokeAgent(a.id);
      setAgents((list) => (list || []).map((x) => (x.id === a.id ? { ...x, ...row, collectionIds: row.collectionIds.length ? row.collectionIds : x.collectionIds } : x)));
      toast(`${a.name} revoked.`);
    } catch (err) {
      toast(err.message || 'Could not revoke the device. Try again.', { tone: 'bad' });
    }
  };

  return (
    <section className="sec set-sec">
      <h3>
        Claude access
        <button type="button" className="sec-act link-btn" onClick={load} disabled={busy}>
          <Icon icon={RefreshCw} className={busy ? 'spin' : ''} /> Refresh
        </button>
      </h3>
      <div className="set-box">
        <div className="set-r">
          <div>
            <h4>Connected devices</h4>
            <p>Each device gets its own key for the collections you choose. Revoke a device to cut it off.</p>
          </div>
          <button type="button" className="btn btn-sec" onClick={() => setConnecting(true)}>
            <Icon icon={Plus} /> Connect a device
          </button>
        </div>
        {error ? (
          <p className="empty err">{error}</p>
        ) : !agents ? (
          <p className="empty">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="empty">No devices connected yet.</p>
        ) : (
          agents.map((a) => (
            <div key={a.id} className={`set-r agent-r ${a.revokedAt ? 'revoked' : ''}`}>
              <div>
                <h4>
                  {a.name}
                  <span className={`chip ${a.revokedAt ? 'c-mute' : 'c-ai'}`}>{a.canWrite ? 'Read and write' : 'Read only'}</span>
                  {a.revokedAt && <span className="chip c-mute">Revoked {fmtDate(a.revokedAt)}</span>}
                </h4>
                <p>{names(a.collectionIds)}</p>
                <p className="agent-meta">
                  <span>Last used {a.lastUsedAt ? fmtDateTime(a.lastUsedAt) : 'never'}</span>
                  <span>Created {fmtDate(a.createdAt)}</span>
                </p>
              </div>
              {!a.revokedAt && (
                <button type="button" className="btn btn-danger-soft" onClick={() => revoke(a)} aria-label={`Revoke ${a.name}`}>
                  <Icon icon={Ban} /> Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {connecting && (
        <ConnectDialog
          collections={collections}
          onClose={() => setConnecting(false)}
          onCreated={(agent) => setAgents((list) => [agent, ...(list || [])])}
        />
      )}
    </section>
  );
}
