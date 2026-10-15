import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Icon from './Icon.jsx';

// Password field with a show/hide toggle.
export default function PasswordInput({ id, value, onChange, autoComplete = 'current-password', label, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="inp inp-wrap">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...rest}
      />
      <button
        type="button"
        className="ib"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? `Hide ${label || 'password'}` : `Show ${label || 'password'}`}
        aria-pressed={show}
      >
        <Icon icon={show ? EyeOff : Eye} />
      </button>
    </div>
  );
}
