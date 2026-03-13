import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Shield, Sliders } from 'lucide-react';
import PasswordStrength from './PasswordStrength';
import { generatePassword } from '../utils/passwordGenerator';
import { copyToClipboard } from '../utils/clipboard';
import { useUI } from '../contexts/UIContext';

const PasswordGeneratorPage = () => {
  const { showToast } = useUI();
  const [options, setOptions] = useState({
    length: 12,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const canGenerate = useMemo(() => {
    return options.uppercase || options.lowercase || options.numbers || options.symbols;
  }, [options]);

  // Auto-generate on mount and whenever options change
  useEffect(() => {
    if (!canGenerate) {
      setPassword('');
      return;
    }
    setPassword(generatePassword(options));
  }, [canGenerate, options]);

  const handleRegenerate = () => {
    if (!canGenerate) return;
    setPassword(generatePassword(options));
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(password);
    if (success) {
      setCopied(true);
      showToast("Password copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 1500);
    } else {
      showToast("Failed to copy. Try manual copy.", "error");
    }
  };

  return (
    <div className="generator-page">
      <div className="generator-hero glass-panel">
        <div className="generator-hero-title">
          <div className="generator-hero-icon">
            <Shield size={18} />
          </div>
          <div>
            <h2>Password Generator</h2>
            <p>Create strong passwords without touching the vault.</p>
          </div>
        </div>

        <div className="generator-output">
          <input
            type="text"
            value={password}
            readOnly
            placeholder="Adjust options or click refresh to get a new password..."
          />
          <button className="icon-btn" type="button" onClick={handleRegenerate} title="Regenerate">
            <RefreshCw size={16} />
          </button>
          <button
            className="action-btn"
            type="button"
            onClick={handleCopy}
            disabled={!password}
            title="Copy"
            style={{ flex: 'unset', minWidth: 110 }}
          >
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <PasswordStrength password={password} />
      </div>

      <div className="generator-controls glass-panel">
        <div className="generator-controls-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} />
            <h3>Options</h3>
          </div>
          {!canGenerate && <span className="generator-warning">Select at least one option.</span>}
        </div>

        <div className="generator-length">
          <div className="generator-length-row">
            <span>Length</span>
            <span className="generator-length-value">{options.length}</span>
          </div>
          <input
            className="gen-slider"
            type="range"
            min="8"
            max="64"
            value={options.length}
            onChange={(e) => setOptions({ ...options, length: parseInt(e.target.value) })}
          />
        </div>

        <div className="generator-toggles">
          {[
            { key: 'uppercase', label: 'Uppercase', hint: 'ABC' },
            { key: 'lowercase', label: 'Lowercase', hint: 'abc' },
            { key: 'numbers', label: 'Numbers', hint: '123' },
            { key: 'symbols', label: 'Symbols', hint: '#$%' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`gen-option-btn ${options[opt.key] ? 'active' : ''}`}
              onClick={() => setOptions({ ...options, [opt.key]: !options[opt.key] })}
            >
              <span>{opt.label}</span>
              <span style={{ opacity: 0.7, fontFamily: 'monospace' }}>{opt.hint}</span>
            </button>
          ))}
        </div>

        <button className="btn-primary" type="button" onClick={handleRegenerate} disabled={!canGenerate}>
          <RefreshCw size={16} />
          Regenerate
        </button>
      </div>
    </div>
  );
};

export default PasswordGeneratorPage;

