// Whether the Sticky Notes panel is open. One panel lives in the app shell, so
// the top bar button and the notebook ribbon button toggle the same thing.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

export function setStickyNotesOpen(value: boolean) { if (open !== value) { open = value; emit(); } }
export function toggleStickyNotes() { setStickyNotesOpen(!open); }
export function useStickyNotesOpen() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => open, () => false);
}
