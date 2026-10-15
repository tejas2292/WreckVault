import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSession } from '../../state/session.jsx';
import Icon from '../components/Icon.jsx';
import VaultMark from '../components/VaultMark.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function LockScreen() {
  const { user, unlock, logout } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!password) return setError('Enter your master password.');
    setBusy(true);
    setError('');
    const res = await unlock(password);
    setBusy(false);
    if (!res?.ok) {
      setError(res?.error || 'Could not unlock the vault. Try again.');
      setPassword('');
    }
  };

  return (
    <main className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <span className="mark lg">
            <VaultMark size={26} />
          </span>
          <h1>WreckVault is locked</h1>
          <p>
            {user?.username ? (
              <>
                Signed in as <strong>{user.username}</strong>. Enter your master password to unlock.
              </>
            ) : (
              'Enter your master password to unlock.'
            )}
          </p>
        </div>
        <div className="gate-panel">
          <form onSubmit={submit} noValidate>
            <input type="text" name="username" autoComplete="username" value={user?.username || ''} readOnly hidden />
            <div className="fld">
              <label htmlFor="lock-pass">Master password</label>
              <PasswordInput id="lock-pass" value={password} onChange={setPassword} label="master password" disabled={busy} autoFocus />
            </div>
            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-pri btn-block" disabled={busy}>
              {busy ? (
                <>
                  <Icon icon={Loader2} className="spin" /> Deriving key…
                </>
              ) : (
                'Unlock'
              )}
            </button>
          </form>
        </div>
        <p className="gate-foot">
          Not you?{' '}
          <button type="button" className="link-btn" onClick={() => logout()} disabled={busy}>
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
