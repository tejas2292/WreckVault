import { useCallback, useEffect, useState } from 'react';
import { copyText, scheduleClear } from '../../lib/clipboard.js';
import { useToast } from '../context/toast.jsx';

// Current time, re-rendering every `ms` while enabled.
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

export function useMediaQuery(query) {
  const get = () => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const [match, setMatch] = useState(get);
  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia(query);
    } catch {
      return undefined;
    }
    const on = () => setMatch(mql.matches);
    on();
    mql.addEventListener?.('change', on);
    return () => mql.removeEventListener?.('change', on);
  }, [query]);
  return match;
}

// Copy a value, schedule the clipboard clear and say so in a toast.
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text, label = 'Value') => {
      let ok = false;
      try {
        ok = await copyText(String(text ?? ''));
      } catch {
        ok = false;
      }
      if (ok) {
        try {
          scheduleClear(30000);
        } catch {
          // Clearing is best effort.
        }
        toast(`${label} copied. Clipboard clears in 30 s.`);
      } else {
        toast(`Could not copy ${label.toLowerCase()}. Reveal it and copy it by hand.`, { tone: 'bad' });
      }
      return ok;
    },
    [toast],
  );
}
