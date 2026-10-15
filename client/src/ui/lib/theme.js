// Theme preference: 'system' | 'light' | 'dark', stored in localStorage 'wv-theme' and applied as
// data-theme on <html>. Storage may be unavailable (private mode, blocked site data); that is fine.

const KEY = 'wv-theme';
export const THEMES = ['system', 'light', 'dark'];

const META = { light: '#EEF0F2', dark: '#0B0D0F' };

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolvedTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  else root.removeAttribute('data-theme');
  // Keep the browser chrome colour in step with a forced theme.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute('data-media') || m.getAttribute('media') || '';
    if (!m.getAttribute('data-media') && media) m.setAttribute('data-media', media);
    if (pref === 'system') {
      if (m.getAttribute('data-media')) m.setAttribute('media', m.getAttribute('data-media'));
      m.setAttribute('content', /dark/.test(m.getAttribute('data-media') || '') ? META.dark : META.light);
    } else {
      m.removeAttribute('media');
      m.setAttribute('content', META[pref]);
    }
  });
}

export function setStoredTheme(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
  applyTheme(pref);
}

export function nextTheme(pref) {
  // Toggle between light and dark relative to what is on screen now.
  return resolvedTheme(pref) === 'dark' ? 'light' : 'dark';
}
