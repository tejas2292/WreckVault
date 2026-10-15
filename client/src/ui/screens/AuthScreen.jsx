import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useSession } from '../../state/session.jsx';
import Icon from '../components/Icon.jsx';
import VaultMark from '../components/VaultMark.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import StrengthBar from '../components/StrengthBar.jsx';
import { passwordScore } from '../lib/strength.js';

const MIN_MASTER = 10;

// Sign-in, and create account when the server allows registration.
export default function AuthScreen() {
  const { login, register, registrationOpen, error: sessionError } = useSession();
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A session-level message (for example "Your session expired") shows on first render.
  useEffect(() => {
    if (sessionError) setError(sessionError);
  }, [sessionError]);

  useEffect(() => {
    if (!registrationOpen && mode === 'register') setMode('signin');
  }, [registrationOpen, mode]);

  const creating = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const name = username.trim();
    if (!name) return setError('Enter your username.');
    if (!password) return setError('Enter your master password.');
    if (creating) {
      if (password.length < MIN_MASTER) return setError(`Use at least ${MIN_MASTER} characters for the master password.`);
      if (password !== confirm) return setError('The two passwords do not match. Type them again.');
    }
    setBusy(true);
    const res = creating ? await register(name, password) : await login(name, password);
    setBusy(false);
    if (!res?.ok) setError(res?.error || (creating ? 'Could not create the account. Try again.' : 'Sign-in failed. Try again.'));
  };

  const switchMode = () => {
    setMode(creating ? 'signin' : 'register');
    setError('');
    setConfirm('');
  };

  return (
    <main className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <span className="mark lg">
            <VaultMark size={26} />
          </span>
          <h1>{creating ? 'Create your vault' : 'Sign in to WreckVault'}</h1>
          <p>
            {creating
              ? 'Your master password encrypts everything on this device. The server never sees it, and nobody can reset it.'
              : 'Your master password unlocks the vault on this device. It never leaves it.'}
          </p>
        </div>

        <div className="gate-panel">
          <form onSubmit={submit} noValidate>
            <div className="fld">
              <label htmlFor="auth-user">Username</label>
              <input
                id="auth-user"
                className="inp"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="alice"
                disabled={busy}
                autoFocus
              />
            </div>
            <div className="fld">
              <label htmlFor="auth-pass">Master password</label>
              <PasswordInput
                id="auth-pass"
                value={password}
                onChange={setPassword}
                autoComplete={creating ? 'new-password' : 'current-password'}
                label="master password"
                disabled={busy}
              />
              {creating && <StrengthBar password={password} showEmpty />}
            </div>
            {creating && (
              <div className="fld">
                <label htmlFor="auth-confirm">Type it again</label>
                <PasswordInput
                  id="auth-confirm"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  label="confirmation"
                  disabled={busy}
                />
                {creating && password && passwordScore(password) < 2 && (
                  <span className="hint">A longer password, or four random words, is much harder to guess.</span>
                )}
              </div>
            )}
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
                <>
                  {creating ? 'Create vault' : 'Unlock vault'} <Icon icon={ArrowRight} />
                </>
              )}
            </button>
          </form>
        </div>

        {registrationOpen && (
          <p className="gate-foot">
            {creating ? 'Already have an account? ' : 'New here? '}
            <button type="button" className="link-btn" onClick={switchMode} disabled={busy}>
              {creating ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        )}
      </div>
    </main>
  );
}
