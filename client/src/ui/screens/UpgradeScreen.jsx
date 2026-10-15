import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Download, Loader2, ShieldCheck } from 'lucide-react';
import { useSession } from '../../state/session.jsx';
import Icon from '../components/Icon.jsx';
import VaultMark from '../components/VaultMark.jsx';
import { plural } from '../lib/format.js';

const STEP_TEXT = {
  fetch: 'Loading your saved entries',
  decrypt: 'Decrypting your entries',
  derive: 'Deriving the new key',
  encrypt: 'Encrypting items',
  verify: 'Checking every item decrypts back to the same data',
  upload: 'Saving the upgraded vault',
  done: 'Finished',
};

function progressOf(p) {
  if (!p) return { text: 'Starting', pct: null };
  const text = STEP_TEXT[p.step] || 'Working';
  if (p.step === 'encrypt' && p.total) {
    return { text: `${text} (${p.done} of ${p.total})`, pct: 10 + Math.round((p.done / p.total) * 70) };
  }
  const fixed = { fetch: 2, decrypt: 5, derive: 8, verify: 85, upload: 92, done: 100 };
  return { text, pct: fixed[p.step] ?? null };
}

// v1 -> v2 upgrade: summary, required backup download, upgrade with progress, then the result.
// The parent keeps this mounted after the session flips to unlocked so the result can be read.
export default function UpgradeScreen({ onStart, onFinish, result, onResult }) {
  const { user, legacySummary, downloadUpgradeBackup, runUpgrade, logout } = useSession();
  const summary = useMemo(() => {
    try {
      return legacySummary();
    } catch {
      return null;
    }
  }, [legacySummary]);
  const [backupName, setBackupName] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const download = () => {
    setError('');
    try {
      const name = downloadUpgradeBackup();
      setBackupName(name || 'backup file');
    } catch (err) {
      setError(err?.message || 'Could not create the backup file. Sign in again and retry.');
    }
  };

  const start = async () => {
    if (!backupName || running) return;
    setError('');
    setRunning(true);
    setProgress(null);
    onStart?.();
    const res = await runUpgrade((p) => setProgress(p));
    setRunning(false);
    if (res?.ok) {
      onResult?.(res);
    } else {
      onResult?.(null);
      setError(res?.error || 'The upgrade failed. Your vault was not changed. Try again.');
    }
  };

  if (result) {
    const und = result.undecryptable || 0;
    return (
      <main className="gate">
        <div className="gate-card wide">
          <div className="gate-head">
            <span className="mark lg">
              <Icon icon={ShieldCheck} size={26} />
            </span>
            <h1>Your vault is upgraded</h1>
            <p>{plural(result.migrated || 0, 'entry', 'entries')} moved into the Personal collection with the new encryption.</p>
          </div>
          <div className="gate-panel">
            <div className="up-stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div className="up-stat">
                <b>{result.migrated || 0}</b>
                <span>Migrated</span>
              </div>
              <div className={`up-stat ${und ? 'bad' : ''}`}>
                <b>{und}</b>
                <span>Could not be decrypted</span>
              </div>
            </div>
            {und > 0 ? (
              <div className="banner b-warn">
                <Icon icon={AlertTriangle} />
                <div>
                  {plural(und, 'entry', 'entries')} could not be decrypted with your current master password, most likely because{' '}
                  {und === 1 ? 'it was' : 'they were'} saved under an older one. Nothing was lost: each one was kept unchanged as a secure note
                  tagged <span className="mono">legacy-undecryptable</span> that holds the original encrypted data, and your old v1 entries are
                  still stored on the server untouched.
                </div>
              </div>
            ) : (
              <div className="banner b-ok">
                <Icon icon={Check} />
                <div>Every entry decrypted and was checked after encryption. Your old v1 entries are still stored on the server untouched.</div>
              </div>
            )}
            <button type="button" className="btn btn-pri btn-block" onClick={onFinish} autoFocus>
              Open vault <Icon icon={ArrowRight} />
            </button>
          </div>
        </div>
      </main>
    );
  }

  const prog = progressOf(progress);
  const und = summary?.undecryptable || 0;

  return (
    <main className="gate">
      <div className="gate-card wide">
        <div className="gate-head">
          <span className="mark lg">
            <VaultMark size={26} />
          </span>
          <h1>Upgrade your vault</h1>
          <p>
            {user?.username ? `${user.username}, this` : 'This'} version of WreckVault uses stronger encryption. Your entries move to the new format
            once, on this device. The server never sees your master password or your data.
          </p>
        </div>

        <div className="gate-panel">
          {summary ? (
            <div className="up-stats">
              <div className="up-stat">
                <b>{summary.total}</b>
                <span>Entries</span>
              </div>
              <div className="up-stat">
                <b>{summary.byType?.password ?? 0}</b>
                <span>Passwords</span>
              </div>
              <div className="up-stat">
                <b>{summary.byType?.card ?? 0}</b>
                <span>Cards</span>
              </div>
              <div className="up-stat">
                <b>{summary.byType?.note ?? 0}</b>
                <span>Notes</span>
              </div>
            </div>
          ) : (
            <p className="err">Your entries could not be read. Sign out, sign in again and retry.</p>
          )}

          {und > 0 && (
            <div className="banner b-warn">
              <Icon icon={AlertTriangle} />
              <div>
                {plural(und, 'entry', 'entries')} will not decrypt with this master password. {und === 1 ? 'It' : 'They'} will be kept
                unchanged, with the original encrypted data, so nothing is lost.
              </div>
            </div>
          )}

          <ol className="steps">
            <li className={`step ${backupName ? 'done' : ''}`}>
              <span className="step-n">{backupName ? <Icon icon={Check} /> : 1}</span>
              <div className="step-b">
                <b>Download a backup</b>
                <p>
                  {backupName ? (
                    <>
                      Saved <span className="mono">{backupName}</span>. It is not encrypted, so keep it somewhere safe and delete it once you
                      have checked the upgrade.
                    </>
                  ) : (
                    'A plain JSON copy of every entry, in the old export format. Required before upgrading.'
                  )}
                </p>
                <button type="button" className="btn btn-sec" onClick={download} disabled={running || !summary}>
                  <Icon icon={Download} /> {backupName ? 'Download again' : 'Download backup'}
                </button>
              </div>
            </li>
            <li className="step">
              <span className="step-n">2</span>
              <div className="step-b">
                <b>Upgrade the vault</b>
                <p>Takes a few seconds. If anything fails, nothing changes and you can try again.</p>
                {running ? (
                  <div className="fld" role="status" aria-live="polite">
                    <div className={`progress ${prog.pct === null ? 'indet' : ''}`}>
                      <i style={prog.pct === null ? undefined : { width: `${prog.pct}%` }} />
                    </div>
                    <span className="busy-note" style={{ justifyContent: 'flex-start' }}>
                      <Icon icon={Loader2} className="spin" /> {prog.text}…
                    </span>
                  </div>
                ) : (
                  <button type="button" className="btn btn-pri" onClick={start} disabled={!backupName || !summary}>
                    Upgrade vault <Icon icon={ArrowRight} />
                  </button>
                )}
                {!backupName && !running && <span className="hint faint">Download the backup first to enable the upgrade.</span>}
              </div>
            </li>
          </ol>

          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
        </div>

        <p className="gate-foot">
          Not now?{' '}
          <button type="button" className="link-btn" onClick={() => logout()} disabled={running}>
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
