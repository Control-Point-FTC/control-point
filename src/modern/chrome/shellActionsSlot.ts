// Where the app's top-right controls (clock and weather, sticky notes, Search,
// Bruno) render when a screen hides the app top bar. The notebook's own top
// row offers a slot; the shell renders the same controls into it, so the
// notebook keeps Search and Bruno without a second implementation.
//
// More than one toolbar can exist (split view keeps a hidden one per pane):
// the visible toolbar claims the slot, and a toolbar only releases the slot
// it holds, so hiding or closing another one never strands the controls.
import { useSyncExternalStore } from 'react';

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

export function claimShellActionsSlot(el: HTMLElement) { if (slot !== el) { slot = el; notify(); } }
export function releaseShellActionsSlot(el: HTMLElement) { if (slot === el) { slot = null; notify(); } }
export function useShellActionsSlot() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => slot, () => null);
}
