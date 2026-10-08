import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
/** What the person picked: a fixed theme, or follow the device. */
export type ThemeChoice = Theme | 'system';

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const systemTheme = (): Theme => {
  try { return window.matchMedia?.(LIGHT_QUERY).matches ? 'light' : 'dark'; } catch { return 'dark'; }
};
const resolveChoice = (c: ThemeChoice): Theme => (c === 'system' ? systemTheme() : c);

function readStoredChoice(): ThemeChoice | null {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : null;
  } catch { return null; }
}

/** localStorage key for the persisted appearance choice. */
export const THEME_STORAGE_KEY = 'cp-theme';

/** Window event fired whenever the theme changes, so every useTheme()
 *  instance (header toggle, setup wizard, …) stays in sync in the same tab. */
const THEME_EVENT = 'cp-theme-change';

function readStoredTheme(): Theme {
  const choice = readStoredChoice();
  if (choice) return resolveChoice(choice);
  // Nothing stored, or storage unavailable (private mode etc.): keep whatever
  // is on screen, so a hook mounting later (e.g. the Settings popup) doesn't
  // reset an in-memory light choice. First load → dark.
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/**
 * Apply the theme to <html>. Idempotent — safe to call during the state
 * initializer so the class lands before first paint-ish, and in StrictMode.
 */
export function applyThemeClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('light', theme === 'light');
}

function persistAndApply(choice: ThemeChoice): Theme {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* ignore — theme just won't persist */
  }
  const theme = resolveChoice(choice);
  applyThemeClass(theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
  return theme;
}

/**
 * Light/dark theme state for Control Point.
 *
 * - Default 'dark' — preserves the app's current Volt & Carbon look.
 * - Persisted to localStorage ('cp-theme').
 * - Toggles the `light` class on <html>; src/index.css redefines the design
 *   tokens under `html.light` and flips Tailwind's white/black utilities,
 *   so the dark-first UI follows the theme without per-component edits.
 * - All hook instances in the tab stay in sync (header toggle + setup wizard).
 */
export function useTheme(): {
  /** What's on screen. */
  theme: Theme;
  /** What was picked ('system' follows the device). */
  choice: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  toggle: () => void;
} {
  const [choice, setChoice] = useState<ThemeChoice>(() => readStoredChoice() ?? readStoredTheme());
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme();
    applyThemeClass(initial);
    return initial;
  });

  // Stay in sync with changes made by other hook instances or other tabs.
  useEffect(() => {
    const onThemeEvent = (e: Event) => {
      setThemeState((e as CustomEvent<Theme>).detail === 'light' ? 'light' : 'dark');
      setChoice(readStoredChoice() ?? readStoredTheme());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const t = readStoredTheme();
      applyThemeClass(t);
      setThemeState(t);
      setChoice(readStoredChoice() ?? t);
    };
    // "System": follow the device when it switches light/dark.
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia?.(LIGHT_QUERY) ?? null; } catch { mq = null; }
    const onSystem = () => {
      if (readStoredChoice() !== 'system') return;
      const t = systemTheme();
      applyThemeClass(t);
      setThemeState(t);
    };
    window.addEventListener(THEME_EVENT, onThemeEvent);
    window.addEventListener('storage', onStorage);
    mq?.addEventListener?.('change', onSystem);
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeEvent);
      window.removeEventListener('storage', onStorage);
      mq?.removeEventListener?.('change', onSystem);
    };
  }, []);

  const setTheme = useCallback((c: ThemeChoice) => {
    setThemeState(persistAndApply(c));
    setChoice(c);
  }, []);

  // Side effects stay OUT of the state updater: persistAndApply dispatches
  // THEME_EVENT, which sets this same state, and React may then re-run a
  // pending updater against that new value — flipping the theme straight
  // back (the "first click does nothing" bug). The <html> class is the
  // source of truth for what's on screen.
  const toggle = useCallback(() => {
    const isLight =
      typeof document !== 'undefined' && document.documentElement.classList.contains('light');
    const next: Theme = isLight ? 'dark' : 'light';
    persistAndApply(next);
    setThemeState(next);
    setChoice(next);
  }, []);

  return { theme, choice, setTheme, toggle };
}
