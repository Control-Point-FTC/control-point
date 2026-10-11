// Where the app's top-right controls (clock and weather, sticky notes, Search,
// Bruno) render when a screen hides the app top bar. The notebook's own top
// row offers a slot; the shell renders the same controls into it, so the
// notebook keeps Search and Bruno without a second implementation.
import { useSyncExternalStore } from 'react';

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** Pass as a ref callback: the element becomes the slot, null releases it. */
export function setShellActionsSlot(el: HTMLElement | null) {
  // Releasing only clears the slot it registered (a newer one stays).
  if (el === null && slot?.isConnected) return;
  if (slot === el) return;
  slot = el; listeners.forEach(fn => fn());
}
export function useShellActionsSlot() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => slot, () => null);
}
