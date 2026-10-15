// Password strength, 0 (very weak) to 4 (very strong). Deliberately simple and explainable:
// length carries most of the weight, character variety adds a little, obvious patterns cost.

const COMMON = [
  'password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey',
  'dragon', 'sunshine', 'princess', 'football', 'baseball', 'abc123', '123456', '111111',
];

export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
export const STRENGTH_TONES = ['bad', 'bad', 'warn', 'ok', 'ok'];

export function passwordScore(pw) {
  if (!pw) return 0;
  const s = String(pw);
  let score = 0;
  if (s.length >= 10) score++;
  if (s.length >= 16) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  if (s.length < 10) score--;
  if (s.length < 6) score = Math.min(score, 0);
  const lower = s.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) score = Math.min(score, 1);
  if (/^(.)\1+$/.test(s)) score = 0;
  // Long passphrases are strong even without symbols.
  if (s.length >= 24) score = Math.max(score, 3);
  return Math.max(0, Math.min(4, score));
}

export function passwordStrength(pw) {
  const score = passwordScore(pw);
  return { score, label: STRENGTH_LABELS[score], tone: STRENGTH_TONES[score], percent: (score + 1) * 20 };
}
