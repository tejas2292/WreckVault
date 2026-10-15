// Clipboard that works over plain HTTP: the async clipboard API only exists in a secure
// context, so fall back to a hidden textarea + document.execCommand('copy').

let clearTimer = null;
let lastCopied = null;

function fallbackCopy(text) {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  ta.style.opacity = '0';
  const active = document.activeElement;
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  if (active && typeof active.focus === 'function') active.focus();
  return ok;
}

export async function copyText(text) {
  const value = text == null ? '' : String(text);
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  if (nav?.clipboard?.writeText && secure) {
    try {
      await nav.clipboard.writeText(value);
      lastCopied = value;
      return true;
    } catch { /* fall through */ }
  }
  const ok = fallbackCopy(value);
  if (ok) lastCopied = value;
  return ok;
}

// Best effort: browsers may refuse a clipboard write that is not inside a user gesture.
function clearNow() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  if (nav?.clipboard?.writeText && secure) {
    nav.clipboard.writeText('').catch(() => {});
    return;
  }
  if (typeof document === 'undefined') return;
  const onCopy = (e) => { e.clipboardData?.setData('text/plain', ''); e.preventDefault(); };
  document.addEventListener('copy', onCopy);
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.removeEventListener('copy', onCopy);
}

// Clear the clipboard after `ms`, unless something else was copied through copyText since.
export function scheduleClear(ms = 30000) {
  if (clearTimer) clearTimeout(clearTimer);
  const expected = lastCopied;
  clearTimer = setTimeout(() => {
    clearTimer = null;
    if (lastCopied === expected) {
      clearNow();
      lastCopied = null;
    }
  }, ms);
}
