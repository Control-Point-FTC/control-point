// Device-local preferences shared by the Legacy SettingsModal and the Modern
// Settings page. Same localStorage keys and defaults as before — nothing about
// where a preference lives changes; this only gives both UIs one reader/writer.
import { useCallback, useState } from 'react';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** String preference with a default. */
export function useStringPref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (read(key) as T | null) ?? fallback);
  const set = useCallback((next: T) => { setV(next); write(key, next); }, [key]);
  return [v, set];
}

/** Boolean preference stored as '1' / '0'. */
export function useBoolPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => {
    const raw = read(key);
    return raw == null ? fallback : raw === '1';
  });
  const set = useCallback((next: boolean) => { setV(next); write(key, next ? '1' : '0'); }, [key]);
  return [v, set];
}

export const BRUNO_PREF_KEYS = {
  explanationStyle: 'controlpoint-bruno-explanation-style',
  responseFormat: 'controlpoint-bruno-response-format',
  autoExplain: 'controlpoint-bruno-auto-explain',
  confirmChanges: 'controlpoint-bruno-confirm-changes',
  rememberPrefs: 'controlpoint-bruno-remember-prefs',
  opmodeStyle: 'controlpoint-ftc-opmode-style',
  indent: 'controlpoint-ftc-indent',
  comments: 'controlpoint-ftc-comments',
  beginnerComments: 'controlpoint-ftc-beginner-comments',
  warnHardware: 'controlpoint-ftc-warn-hardware',
  warnReversed: 'controlpoint-ftc-warn-reversed',
  warnPower: 'controlpoint-ftc-warn-power',
  warnBlocking: 'controlpoint-ftc-warn-blocking',
} as const;

/** The secret NavGPT ❤️ persona only exists for 4215 Hypnotic Robotics. */
export function navGptQualifies(teamName: unknown): boolean {
  const n = String(teamName || '');
  return /hypnotic/i.test(n) || /4215/.test(n);
}
