const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?'
};

export const generatePassword = (options = {}) => {
  const {
    length = 16,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true
  } = options;

  let charset = '';
  const required = [];

  if (uppercase) { charset += CHARSETS.uppercase; required.push(CHARSETS.uppercase); }
  if (lowercase) { charset += CHARSETS.lowercase; required.push(CHARSETS.lowercase); }
  if (numbers)   { charset += CHARSETS.numbers;   required.push(CHARSETS.numbers);   }
  if (symbols)   { charset += CHARSETS.symbols;   required.push(CHARSETS.symbols);   }

  if (!charset) return '';

  const getRandomChar = (str) => str[Math.floor(Math.random() * str.length)];

  // Ensure at least one char from each selected charset
  let password = required.map(getRandomChar);

  // Fill the rest randomly
  while (password.length < length) {
    password.push(getRandomChar(charset));
  }

  // Shuffle (Fisher-Yates)
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
};

export const getPasswordStrength = (password) => {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  // Penalize very short
  if (password.length < 6) score = Math.min(score, 1);

  const levels = [
    { score: 0, label: '',         color: '' },
    { score: 1, label: 'Very Weak', color: '#ff4757' },
    { score: 2, label: 'Weak',      color: '#ff6b6b' },
    { score: 3, label: 'Fair',      color: '#ffa502' },
    { score: 4, label: 'Good',      color: '#fdcb6e' },
    { score: 5, label: 'Strong',    color: '#2ed573' },
    { score: 6, label: 'Excellent', color: '#00b894' },
  ];

  const level = levels[Math.min(score, 6)];
  return { score: Math.min(score, 6), maxScore: 6, ...level };
};

/**
 * Generate a cryptographically secure JWT secret key.
 * @param {number} byteLength - Number of random bytes. Use ceil((bits/4)*6/8) so output length = bits/4 chars (e.g. 24 bytes → 32 chars = 128 bits).
 * @returns {string} Base64url-encoded secret (no padding).
 */
export const generateJwtSecret = (byteLength = 32) => {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
