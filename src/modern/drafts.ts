// Shared draft store (2026 redesign). Unsent input that lives inside a page
// component would be lost when the Legacy and Modern shells swap (the page
// remounts). Pages keep such input here instead; both modes read and write the
// same keys, so switching modes never drops a draft. Cleared on sign-out.
import { useCallback, useState, type SetStateAction } from 'react';

const store = new Map<string, unknown>();

export function getDraft<T>(key: string, fallback: T): T {
  return store.has(key) ? (store.get(key) as T) : fallback;
}

export function setDraft<T>(key: string, value: T): void {
  store.set(key, value);
}

export function clearDrafts(): void {
  store.clear();
}

/** Drop-in replacement for useState whose value survives remounts. */
export function useDraft<T>(key: string, initial: T): [T, (v: SetStateAction<T>) => void] {
  const [value, setValue] = useState<T>(() => getDraft(key, initial));
  const set = useCallback((v: SetStateAction<T>) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      store.set(key, next);
      return next;
    });
  }, [key]);
  return [value, set];
}
