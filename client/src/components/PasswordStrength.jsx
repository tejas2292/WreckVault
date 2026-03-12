import { getPasswordStrength } from '../utils/passwordGenerator';

const PasswordStrength = ({ password }) => {
  const strength = getPasswordStrength(password);
  if (!password) return null;

  return (
    <div className="strength-meter">
      <div className="strength-bars">
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <div
            key={level}
            className="strength-bar"
            style={{
              background: level <= strength.score ? strength.color : 'rgba(255,255,255,0.06)',
            }}
          />
        ))}
      </div>
      <span className="strength-label" style={{ color: strength.color }}>
        {strength.label}
      </span>
    </div>
  );
};

export default PasswordStrength;
