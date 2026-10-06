// Shared draft store (2026 redesign). Unsent input that lives inside a page
// component would be lost when the Legacy and Modern shells swap (the page
// remounts). Pages keep such input here instead; both modes read and write the
// same keys, so switching modes never drops a draft. Cleared on sign-out and
// workspace switch.
//
// The store is observable: every mounted useDraft for a key re-renders when
// that key changes, even if the write came from an instance that has since
// unmounted (e.g. a save that finishes after the user switched modes).
import { useCallback, useRef, useSyncExternalStore, type SetStateAction } from 'react';

const store = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  for (const l of listeners.get(key) ?? []) l();
}

export function getDraft<T>(key: string, fallback: T): T {
  return store.has(key) ? (store.get(key) as T) : fallback;
}

export function setDraft<T>(key: string, value: T): void {
  store.set(key, value);
  emit(key);
}

// Editor-session ids. Controllers stamp each editor session (open/close) with
// one and check it before a late save closes or clears anything. Module-level
// and never reused, so ids stay unique even after clearDrafts() resets the
// stored values (sign-out / workspace switch).
let sessionSeq = 0;
export function newSessionId(): number {
  sessionSeq += 1;
  return sessionSeq;
}

export function clearDrafts(): void {
  const keys = [...store.keys()];
  store.clear();
  for (const k of keys) emit(k);
}

/** Drop-in replacement for useState whose value survives remounts. */
export function useDraft<T>(key: string, initial: T): [T, (v: SetStateAction<T>) => void] {
  // Freeze the initial value so the snapshot stays referentially stable.
  const initialRef = useRef(initial);
  const subscribe = useCallback((cb: () => void) => {
    let set = listeners.get(key);
    if (!set) { set = new Set(); listeners.set(key, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => getDraft(key, initialRef.current), () => initialRef.current);
  const set = useCallback((v: SetStateAction<T>) => {
    const prev = getDraft(key, initialRef.current);
    const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
    setDraft(key, next);
  }, [key]);
  return [value, set];
}
