import { useEffect, useRef, useState } from 'react';
import { Camera, Download, Loader2, LogOut, Monitor, Moon, RefreshCw, Settings, Sun, Trash2, Upload } from 'lucide-react';
import { useSession } from '../../state/session.jsx';
import { useVault } from '../../state/vault.jsx';
import Dialog from '../components/Dialog.jsx';
import Icon from '../components/Icon.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import StrengthBar from '../components/StrengthBar.jsx';
import PageTop from './PageTop.jsx';
import { useConfirm } from '../context/confirm.jsx';
import { useToast } from '../context/toast.jsx';
import { fmtDate, fmtDateTime, initials, plural } from '../lib/format.js';
import { imageToDataUrl } from '../lib/files.js';

const AUTOLOCK = [0, 1, 5, 15, 60];
const MIN_MASTER = 10;

function Section({ title, children }) {
  return (
    <section className="sec set-sec">
      <h3>{title}</h3>
      <div className="set-box">{children}</div>
    </section>
  );
}

function shortAgent(ua) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ') || ua;
}

function ProfileRow() {
  const { user, updateProfileImage } = useSession();
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await imageToDataUrl(file);
      const res = await updateProfileImage(dataUrl);
      if (res?.ok) toast('Profile picture updated.');
      else toast(res?.error || 'Could not update the profile picture. Try again.', { tone: 'bad' });
    } catch (err) {
      toast(err.message, { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await updateProfileImage(null);
    setBusy(false);
    if (res?.ok) toast('Profile picture removed.');
    else toast(res?.error || 'Could not remove the profile picture. Try again.', { tone: 'bad' });
  };

  return (
    <div className="set-r">
      <div className="profile">
        <span className="avatar lg">{user?.profileImage ? <img src={user.profileImage} alt="" /> : initials(user?.username)}</span>
        <div>
          <h4>{user?.username}</h4>
          {user?.createdAt && <p>Member since {fmtDate(user.createdAt)}</p>}
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sec" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon icon={busy ? Loader2 : Camera} className={busy ? 'spin' : ''} /> {user?.profileImage ? 'Change picture' : 'Add picture'}
        </button>
        {user?.profileImage && (
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function ChangePassword() {
  const { changeMasterPassword } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!current) return setError('Enter your current master password.');
    if (next.length < MIN_MASTER) return setError(`Use at least ${MIN_MASTER} characters for the new master password.`);
    if (next !== again) return setError('The new passwords do not match. Type them again.');
    if (next === current) return setError('The new master password is the same as the current one.');
    setError('');
    setBusy(true);
    const res = await changeMasterPassword(current, next);
    setBusy(false);
    if (res?.ok) {
      setCurrent('');
      setNext('');
      setAgain('');
      toast('Master password changed. Use the new one next time you unlock.');
    } else {
      setError(res?.error || 'Could not change the master password. Nothing was changed.');
    }
  };

  return (
    <div className="set-r stack">
      <div>
        <h4>Master password</h4>
        <p>Re-encrypts your vault key with a new password. Your items stay as they are. Nobody can recover a forgotten master password.</p>
      </div>
      <form onSubmit={submit} noValidate>
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <div className="fld">
          <label htmlFor="cp-cur">Current master password</label>
          <PasswordInput id="cp-cur" value={current} onChange={setCurrent} label="current master password" disabled={busy} />
        </div>
        <div className="fld">
          <label htmlFor="cp-new">New master password</label>
          <PasswordInput id="cp-new" value={next} onChange={setNext} autoComplete="new-password" label="new master password" disabled={busy} />
          <StrengthBar password={next} />
        </div>
        <div className="fld">
          <label htmlFor="cp-again">Type the new one again</label>
          <PasswordInput id="cp-again" value={again} onChange={setAgain} autoComplete="new-password" label="new master password again" disabled={busy} />
        </div>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-pri" disabled={busy} style={{ alignSelf: 'flex-start' }}>
          {busy ? (
            <>
              <Icon icon={Loader2} className="spin" /> Deriving key…
            </>
          ) : (
            'Change master password'
          )}
        </button>
      </form>
    </div>
  );
}

function LoginHistory() {
  const { loginHistory } = useSession();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await loginHistory(50);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load the sign-in history. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // Load once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="sec set-sec">
      <h3>
        Sign-in history
        <button type="button" className="sec-act link-btn" onClick={load} disabled={busy}>
          <Icon icon={RefreshCw} className={busy ? 'spin' : ''} /> Refresh
        </button>
      </h3>
      <div className="set-box tbl-wrap">
        {error ? (
          <p className="empty err">{error}</p>
        ) : !rows ? (
          <p className="empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="empty">No sign-ins recorded yet.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Result</th>
                <th scope="col">IP address</th>
                <th scope="col">Device</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.createdAt)}</td>
                  <td>
                    <span className={`chip ${r.success ? 'c-ok' : 'c-bad'}`}>{r.success ? 'Signed in' : 'Failed'}</span>
                  </td>
                  <td className="mono">{r.ipAddress || '—'}</td>
                  <td className="ua" title={r.userAgent || ''}>
                    {shortAgent(r.userAgent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DeleteAccountDialog({ onClose }) {
  const { user, deleteAccount } = useSession();
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const phrase = user?.username || 'delete';
  const ready = typed.trim() === phrase && password;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    const res = await deleteAccount(password);
    if (!res?.ok) {
      setBusy(false);
      setError(res?.error || 'Could not delete the account. Try again.');
    }
  };

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      title="Delete your account?"
      size="sm"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-sec" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!ready || busy}>
            {busy ? <Icon icon={Loader2} className="spin" /> : <Icon icon={Trash2} />} Delete account
          </button>
        </>
      }
    >
      <p>
        This erases every item, collection, earlier version and old v1 entry in this account from the server. It cannot be undone. Export
        your vault first if you want a copy.
      </p>
      <div className="fld">
        <label htmlFor="del-type">
          Type <strong className="mono">{phrase}</strong> to confirm
        </label>
        <input
          id="del-type"
          className="inp"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          data-autofocus
        />
      </div>
      <div className="fld">
        <label htmlFor="del-pass">Master password</label>
        <PasswordInput id="del-pass" value={password} onChange={setPassword} label="master password" disabled={busy} />
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

export default function SettingsPage({ theme, onTheme, onMenu }) {
  const { autoLockMinutes, setAutoLockMinutes, logout } = useSession();
  const { exportVault, importFile } = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const importRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doExport = async () => {
    const ok = await confirm({
      title: 'Export without encryption?',
      message: 'The file holds every password and secret in plain text. Anyone who opens it can read them. Store it somewhere safe and delete it when you are done.',
      confirmLabel: 'Export',
      danger: true,
    });
    if (!ok) return;
    try {
      const name = exportVault();
      toast(`Saved ${name}.`);
    } catch (err) {
      toast(err.message || 'Could not export the vault. Try again.', { tone: 'bad' });
    }
  };

  const doImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await importFile(file);
      const skipped = res?.skipped ? ` Skipped ${res.skipped}.` : '';
      toast(`Imported ${plural(res?.imported || 0, 'item')} into Personal.${skipped}`);
    } catch (err) {
      toast(err.message || 'Could not import the file. Try again.', { tone: 'bad' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageTop icon={Settings} title="Settings" onMenu={onMenu} />
      <div className="d-body">
        <div className="d-head">
          <div>
            <h1>Settings</h1>
          </div>
        </div>

        <Section title="Profile">
          <ProfileRow />
        </Section>

        <Section title="Appearance">
          <div className="set-r">
            <div>
              <h4>Theme</h4>
              <p>System follows your device setting.</p>
            </div>
            <div className="seg" role="group" aria-label="Theme">
              {[
                ['system', 'System', Monitor],
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
              ].map(([k, label, ic]) => (
                <button type="button" key={k} aria-pressed={theme === k} onClick={() => onTheme(k)}>
                  <Icon icon={ic} /> {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Security">
          <div className="set-r">
            <div>
              <h4>Auto-lock</h4>
              <p>Lock the vault after this long without activity on this device.</p>
            </div>
            <div className="seg" role="group" aria-label="Auto-lock after">
              {AUTOLOCK.map((m) => (
                <button type="button" key={m} aria-pressed={autoLockMinutes === m} onClick={() => setAutoLockMinutes(m)}>
                  {m === 0 ? 'Off' : `${m} min`}
                </button>
              ))}
            </div>
          </div>
          <ChangePassword />
        </Section>

        <Section title="Data">
          <div className="set-r">
            <div>
              <h4>Export</h4>
              <p>Download every item, including trashed ones, as a JSON file. The file is not encrypted.</p>
            </div>
            <button type="button" className="btn btn-sec" onClick={doExport}>
              <Icon icon={Download} /> Export JSON
            </button>
          </div>
          <div className="set-r">
            <div>
              <h4>Import</h4>
              <p>Add items from a WreckVault export (v1 or v2) or a CSV with name, url, username, password and notes columns. Duplicates are not merged.</p>
            </div>
            <button type="button" className="btn btn-sec" onClick={() => importRef.current?.click()} disabled={importing}>
              <Icon icon={importing ? Loader2 : Upload} className={importing ? 'spin' : ''} /> {importing ? 'Importing…' : 'Import file'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              hidden
              onChange={(e) => {
                doImport(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </Section>

        <LoginHistory />

        <Section title="Account">
          <div className="set-r">
            <div>
              <h4>Sign out</h4>
              <p>Ends the session on this device and drops the keys from memory.</p>
            </div>
            <button type="button" className="btn btn-sec" onClick={() => logout()}>
              <Icon icon={LogOut} /> Sign out
            </button>
          </div>
          <div className="set-r">
            <div>
              <h4>Delete account</h4>
              <p>Permanently erases your account and everything in it.</p>
            </div>
            <button type="button" className="btn btn-danger-soft" onClick={() => setDeleting(true)}>
              <Icon icon={Trash2} /> Delete account
            </button>
          </div>
        </Section>
      </div>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  );
}
