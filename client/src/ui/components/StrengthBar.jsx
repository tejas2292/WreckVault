import { passwordStrength } from '../lib/strength.js';

export default function StrengthBar({ password, showEmpty = false }) {
  if (!password && !showEmpty) return null;
  const s = passwordStrength(password);
  return (
    <div className="strength">
      <span
        className="bar"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={s.score}
        aria-valuetext={s.label}
      >
        <i className={`tone-${s.tone}`} style={{ width: password ? `${s.percent}%` : 0 }} />
      </span>
      {password ? s.label : 'No password yet'}
    </div>
  );
}
