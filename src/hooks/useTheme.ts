import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

/** localStorage key for the persisted appearance choice. */
export const THEME_STORAGE_KEY = 'cp-theme';

/** Window event fired whenever the theme changes, so every useTheme()
 *  instance (header toggle, setup wizard, …) stays in sync in the same tab. */
const THEME_EVENT = 'cp-theme-change';

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // Storage unavailable (private mode etc.) — fall back to dark, the app's
    // designed look. Nothing persists, but the toggle still works in-memory.
    return 'dark';
  }
}

/**
 * Apply the theme to <html>. Idempotent — safe to call during the state
 * initializer so the class lands before first paint-ish, and in StrictMode.
 */
export function applyThemeClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('light', theme === 'light');
}

function persistAndApply(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore — theme just won't persist */
  }
  applyThemeClass(theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
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
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme();
    applyThemeClass(initial);
    return initial;
  });

  // Stay in sync with changes made by other hook instances or other tabs.
  useEffect(() => {
    const onThemeEvent = (e: Event) => {
      setThemeState((e as CustomEvent<Theme>).detail === 'light' ? 'light' : 'dark');
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setThemeState(readStoredTheme());
    };
    window.addEventListener(THEME_EVENT, onThemeEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    persistAndApply(t);
    setThemeState(t);
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
  }, []);

  return { theme, setTheme, toggle };
}
