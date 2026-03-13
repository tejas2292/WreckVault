import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Shield, Sliders, KeyRound } from "lucide-react";
import PasswordStrength from "./PasswordStrength";
import {
  generatePassword,
  generateJwtSecret,
} from "../utils/passwordGenerator";
import { copyToClipboard } from "../utils/clipboard";
import { useUI } from "../contexts/UIContext";

const JWT_LENGTH_MIN = 8;
const JWT_LENGTH_MAX = 512;
const JWT_LENGTH_STEP = 8;

const PasswordGeneratorPage = ({ generatorTab = "password" }) => {
  const { showToast } = useUI();
  const [options, setOptions] = useState({
    length: 12,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [jwtLengthBits, setJwtLengthBits] = useState(128);
  const [jwtSecret, setJwtSecret] = useState("");
  const [jwtCopied, setJwtCopied] = useState(false);
  const [jwtShowSecret, setJwtShowSecret] = useState(false);

  const canGenerate = useMemo(() => {
    return (
      options.uppercase ||
      options.lowercase ||
      options.numbers ||
      options.symbols
    );
  }, [options]);

  // Auto-generate on mount and whenever options change
  useEffect(() => {
    if (!canGenerate) {
      setPassword("");
      return;
    }
    setPassword(generatePassword(options));
  }, [canGenerate, options]);

  // Auto-generate JWT secret on mount and when length (bits) changes.
  // Byte length chosen so base64 output has bits/4 characters: 8 chars (32b), 16 (64b), 24 (96b), 32 (128b).
  const jwtByteLength = Math.max(1, Math.ceil(((jwtLengthBits / 4) * 6) / 8));
  useEffect(() => {
    setJwtSecret(generateJwtSecret(jwtByteLength));
  }, [jwtByteLength]);

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

  const handleJwtRegenerate = () =>
    setJwtSecret(generateJwtSecret(jwtByteLength));

  const jwtDisplayValue = jwtShowSecret
    ? jwtSecret
    : jwtSecret
      ? (() => {
          const len = jwtSecret.length;
          if (len < 4) return "*".repeat(len);
          if (len <= 12)
            return (
              jwtSecret.slice(0, 2) + "*".repeat(len - 4) + jwtSecret.slice(-2)
            );
          return (
            jwtSecret.slice(0, 6) + "*".repeat(len - 12) + jwtSecret.slice(-6)
          );
        })()
      : "";

  const handleJwtCopy = async () => {
    const success = await copyToClipboard(jwtSecret);
    if (success) {
      setJwtCopied(true);
      showToast("JWT secret copied to clipboard!", "success");
      setTimeout(() => setJwtCopied(false), 1500);
    } else {
      showToast("Failed to copy. Try manual copy.", "error");
    }
  };

  return (
    <div className="generator-page">
      {generatorTab === "password" && (
        <>
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
              <button
                className="icon-btn"
                type="button"
                onClick={handleRegenerate}
                title="Regenerate"
              >
                <RefreshCw size={16} />
              </button>
              <button
                className="action-btn"
                type="button"
                onClick={handleCopy}
                disabled={!password}
                title="Copy"
                style={{ flex: "unset", minWidth: 110 }}
              >
                <Copy size={14} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <PasswordStrength password={password} />
          </div>

          <div className="generator-controls glass-panel">
            <div className="generator-controls-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sliders size={16} />
                <h3>Options</h3>
              </div>
              {!canGenerate && (
                <span className="generator-warning">
                  Select at least one option.
                </span>
              )}
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
                onChange={(e) =>
                  setOptions({ ...options, length: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="generator-toggles">
              {[
                { key: "uppercase", label: "Uppercase", hint: "ABC" },
                { key: "lowercase", label: "Lowercase", hint: "abc" },
                { key: "numbers", label: "Numbers", hint: "123" },
                { key: "symbols", label: "Symbols", hint: "#$%" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`gen-option-btn ${options[opt.key] ? "active" : ""}`}
                  onClick={() =>
                    setOptions({ ...options, [opt.key]: !options[opt.key] })
                  }
                >
                  <span>{opt.label}</span>
                  <span style={{ opacity: 0.7, fontFamily: "monospace" }}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>

            <button
              className="btn-primary"
              type="button"
              onClick={handleRegenerate}
              disabled={!canGenerate}
            >
              <RefreshCw size={16} />
              Regenerate
            </button>
          </div>
        </>
      )}

      {generatorTab === "jwt" && (
        <>
          <div className="generator-hero generator-jwt glass-panel">
            <div className="generator-hero-title">
              <div className="generator-hero-icon generator-jwt-icon">
                <KeyRound size={18} />
              </div>
              <div>
                <h2>JWT Secret Key</h2>
                <p>Generate a secure random key for signing your JWT tokens.</p>
              </div>
            </div>

            <div className="generator-output">
              <input
                type="text"
                value={jwtDisplayValue}
                readOnly
                placeholder="Adjust options and generate a secret..."
                className="generator-jwt-input"
              />
              <button
                className="icon-btn"
                type="button"
                onClick={handleJwtRegenerate}
                title="Regenerate"
              >
                <RefreshCw size={16} />
              </button>
              <button
                className="action-btn"
                type="button"
                onClick={handleJwtCopy}
                disabled={!jwtSecret}
                title="Copy"
                style={{ flex: "unset", minWidth: 110 }}
              >
                <Copy size={14} />
                {jwtCopied ? "Copied" : "Copy"}
              </button>
            </div>

            <p
              className="generator-jwt-hint padding-top-10"
              style={{ marginTop: "10px" }}
            >
              Copy the secret and store it safely.{" "}
              {jwtSecret
                ? `${jwtSecret.length} characters (${jwtLengthBits} bits)`
                : "—"}
            </p>

            <div className="generator-jwt-toggles">
              <label className="generator-jwt-toggle generator-jwt-toggle-switch">
                <input
                  type="checkbox"
                  className="generator-jwt-toggle-input"
                  checked={jwtShowSecret}
                  onChange={(e) => setJwtShowSecret(e.target.checked)}
                />
                <span className="generator-jwt-toggle-track" />
                <span className="generator-jwt-toggle-label">
                  Show full secret
                </span>
              </label>
            </div>
            {!jwtShowSecret && jwtSecret && (
              <p className="generator-jwt-security-msg">
                Full secret is hidden. Use the toggle to reveal.
              </p>
            )}
          </div>

          <div className="generator-controls glass-panel">
            <div className="generator-controls-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sliders size={16} />
                <h3>Options</h3>
              </div>
            </div>

            <div className="generator-jwt-length">
              <div className="generator-length-row">
                <span className="generator-jwt-label">Secret length</span>
                <span className="generator-length-value">
                  {jwtLengthBits} bits
                </span>
              </div>
              <input
                className="gen-slider"
                type="range"
                min={JWT_LENGTH_MIN}
                max={JWT_LENGTH_MAX}
                step={JWT_LENGTH_STEP}
                value={jwtLengthBits}
                onChange={(e) => setJwtLengthBits(Number(e.target.value))}
              />
              <div className="generator-jwt-length-marks">
                <span>8</span>
                <span>128</span>
                <span>256</span>
                <span>384</span>
                <span>512</span>
              </div>
            </div>

            <button
              className="btn-primary"
              type="button"
              onClick={handleJwtRegenerate}
            >
              <RefreshCw size={16} />
              Generate
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PasswordGeneratorPage;
