import { useState } from 'react';
import { Copy, KeyRound, RefreshCw, Shield, SlidersHorizontal, Wand2 } from 'lucide-react';
import Icon from '../components/Icon.jsx';
import StrengthBar from '../components/StrengthBar.jsx';
import PageTop from './PageTop.jsx';
import { useCopy } from '../lib/hooks.js';
import {
  DEFAULT_PASSWORD_OPTIONS, JWT_LENGTH_DEFAULT, JWT_LENGTH_MAX, JWT_LENGTH_MIN, JWT_LENGTH_STEP,
  generateJwtSecret, generatePassword, jwtByteLength, maskSecret,
} from '../lib/generator.js';

const TOGGLES = [
  { key: 'uppercase', label: 'Uppercase', hint: 'ABC' },
  { key: 'lowercase', label: 'Lowercase', hint: 'abc' },
  { key: 'numbers', label: 'Numbers', hint: '123' },
  { key: 'symbols', label: 'Symbols', hint: '#$%' },
];

function PasswordTab() {
  const copy = useCopy();
  const [options, setOptionsState] = useState(DEFAULT_PASSWORD_OPTIONS);
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_PASSWORD_OPTIONS));
  const canGenerate = options.uppercase || options.lowercase || options.numbers || options.symbols;

  // A new password whenever the options change, as v1 did.
  const setOptions = (next) => {
    setOptionsState(next);
    const ok = next.uppercase || next.lowercase || next.numbers || next.symbols;
    setPassword(ok ? generatePassword(next) : '');
  };

  const regenerate = () => canGenerate && setPassword(generatePassword(options));

  return (
    <>
      <div className="sec">
        <h3>
          <Icon icon={Shield} /> Password
        </h3>
        <div className="box" style={{ padding: 'var(--s4)' }}>
          <div className="gen-out">
            <input className="inp" value={password} readOnly aria-label="Generated password" placeholder="Choose at least one character set" />
            <button type="button" className="ib" onClick={regenerate} disabled={!canGenerate} aria-label="Generate another password" title="Regenerate">
              <Icon icon={RefreshCw} />
            </button>
            <button type="button" className="btn btn-pri" onClick={() => copy(password, 'Password')} disabled={!password}>
              <Icon icon={Copy} /> Copy
            </button>
          </div>
          <StrengthBar password={password} />
        </div>
      </div>
      <div className="sec">
        <h3>
          <Icon icon={SlidersHorizontal} /> Options
          {!canGenerate && <span className="sec-act err">Select at least one option.</span>}
        </h3>
        <div className="box fld" style={{ padding: 'var(--s4)', gap: 'var(--s4)' }}>
          <div className="fld">
            <label className="slider-row" htmlFor="gen-len">
              <span>Length</span>
              <b>{options.length}</b>
            </label>
            <input
              id="gen-len"
              className="slider"
              type="range"
              min="8"
              max="64"
              value={options.length}
              onChange={(e) => setOptions({ ...options, length: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="gen-opts">
            {TOGGLES.map((o) => (
              <button
                type="button"
                key={o.key}
                className="gen-opt"
                aria-pressed={options[o.key]}
                onClick={() => setOptions({ ...options, [o.key]: !options[o.key] })}
              >
                <span>{o.label}</span>
                <span className="mono">{o.hint}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sec" onClick={regenerate} disabled={!canGenerate} style={{ alignSelf: 'flex-start' }}>
            <Icon icon={RefreshCw} /> Regenerate
          </button>
        </div>
      </div>
    </>
  );
}

function JwtTab() {
  const copy = useCopy();
  const [bits, setBitsState] = useState(JWT_LENGTH_DEFAULT);
  const [secret, setSecret] = useState(() => generateJwtSecret(jwtByteLength(JWT_LENGTH_DEFAULT)));
  const [show, setShow] = useState(false);
  const bytes = jwtByteLength(bits);

  const setBits = (n) => {
    setBitsState(n);
    if (jwtByteLength(n) !== bytes) setSecret(generateJwtSecret(jwtByteLength(n)));
  };

  const regenerate = () => setSecret(generateJwtSecret(bytes));

  return (
    <>
      <div className="sec">
        <h3>
          <Icon icon={KeyRound} /> JWT secret key
        </h3>
        <div className="box fld" style={{ padding: 'var(--s4)', gap: 'var(--s3)' }}>
          <p className="quiet">A random key for signing your JWT tokens.</p>
          <div className="gen-out">
            <input className="inp" value={show ? secret : maskSecret(secret)} readOnly aria-label="Generated JWT secret" />
            <button type="button" className="ib" onClick={regenerate} aria-label="Generate another secret" title="Regenerate">
              <Icon icon={RefreshCw} />
            </button>
            <button type="button" className="btn btn-pri" onClick={() => copy(secret, 'JWT secret')} disabled={!secret}>
              <Icon icon={Copy} /> Copy
            </button>
          </div>
          <p className="quiet num">
            Copy the secret and store it safely. {secret ? `${secret.length} characters (${bits} bits)` : ''}
          </p>
          <label className="switch">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            <span className="track" aria-hidden="true" />
            Show full secret
          </label>
          {!show && secret && <p className="quiet">The full secret is hidden. Use the switch to reveal it.</p>}
        </div>
      </div>
      <div className="sec">
        <h3>
          <Icon icon={SlidersHorizontal} /> Options
        </h3>
        <div className="box fld" style={{ padding: 'var(--s4)', gap: 'var(--s3)' }}>
          <label className="slider-row" htmlFor="jwt-len">
            <span>Secret length</span>
            <b>{bits} bits</b>
          </label>
          <input
            id="jwt-len"
            className="slider"
            type="range"
            min={JWT_LENGTH_MIN}
            max={JWT_LENGTH_MAX}
            step={JWT_LENGTH_STEP}
            value={bits}
            onChange={(e) => setBits(Number(e.target.value))}
          />
          <div className="marks" aria-hidden="true">
            <span>8</span>
            <span>128</span>
            <span>256</span>
            <span>384</span>
            <span>512</span>
          </div>
          <button type="button" className="btn btn-sec" onClick={regenerate} style={{ alignSelf: 'flex-start' }}>
            <Icon icon={RefreshCw} /> Generate
          </button>
        </div>
      </div>
    </>
  );
}

export default function GeneratorPage({ onMenu }) {
  const [tab, setTab] = useState('password');
  return (
    <>
      <PageTop icon={Wand2} title="Generator" onMenu={onMenu} />
      <div className="d-body">
        <div className="d-head">
          <div>
            <h1>Generator</h1>
            <p>Make strong passwords and signing secrets without saving anything to the vault.</p>
          </div>
        </div>
        <div className="seg" role="group" aria-label="What to generate">
          <button type="button" aria-pressed={tab === 'password'} onClick={() => setTab('password')}>
            <Icon icon={Shield} /> Password
          </button>
          <button type="button" aria-pressed={tab === 'jwt'} onClick={() => setTab('jwt')}>
            <Icon icon={KeyRound} /> JWT secret
          </button>
        </div>
        {tab === 'password' ? <PasswordTab /> : <JwtTab />}
      </div>
    </>
  );
}
