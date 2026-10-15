import { secondsLeft, totpCode } from '../../lib/totp.js';

// totpCode throws on a bad secret; the UI shows a message instead.
export function safeTotp(secret, now = Date.now()) {
  try {
    const code = totpCode(secret, now);
    return typeof code === 'string' && code ? code : null;
  } catch {
    return null;
  }
}

export function safeSecondsLeft(now = Date.now()) {
  try {
    const n = secondsLeft(now);
    if (Number.isFinite(n)) return n;
  } catch {
    // fall through
  }
  return 30 - (Math.floor(now / 1000) % 30);
}
