import { useNow } from '../lib/hooks.js';
import { safeSecondsLeft, safeTotp } from '../lib/otp.js';

const R = 8;
const C = 2 * Math.PI * R;

// Live one-time code with a countdown ring.
export default function Totp({ secret }) {
  const now = useNow(1000);
  const code = safeTotp(secret, now);
  if (!code) return <span className="quiet">Invalid 2FA secret. Edit the item and paste the base32 secret or otpauth:// link again.</span>;
  const left = safeSecondsLeft(now);
  const shown = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <div className="totp">
      <b aria-label={`One-time code ${code.split('').join(' ')}`}>{shown}</b>
      <svg className={`ring ${left <= 5 ? 'low' : ''}`} viewBox="0 0 20 20" aria-hidden="true">
        <circle className="ring-bg" cx="10" cy="10" r={R} />
        <circle
          className="ring-fg"
          cx="10"
          cy="10"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - left / 30)}
          transform="rotate(-90 10 10)"
        />
      </svg>
      <span className="ring-n" aria-label={`${left} seconds left`}>
        {left}s
      </span>
    </div>
  );
}
