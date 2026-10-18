// Toolbar density: compact (one slim row of icons, the default) or expanded
// (tabs on their own row and labelled commands). Separate from hiding the
// toolbar. The choice is personal and kept on this device; every toolbar on
// the page (split view keeps one per pane) shares it.
import { createContext, useContext, useSyncExternalStore } from 'react';

export type RibbonDensity = 'compact' | 'expanded';

const listeners = new Set<() => void>();
const memory = new Map<string, RibbonDensity>();

export const densityKey = (memberId?: number | null) => `cp-notebook-density:${memberId ?? 'device'}`;

export function readDensity(key: string): RibbonDensity {
  const unsaved = memory.get(key);
  if (unsaved) return unsaved;
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); } catch { /* blocked storage: fall back to this visit's choice */ }
  if (saved === 'expanded' || saved === 'compact') return saved;
  return 'compact';
}
export function writeDensity(key: string, value: RibbonDensity) {
  memory.delete(key);
  try { localStorage.setItem(key, value); } catch { memory.set(key, value); /* storage is optional: the choice lasts for this visit */ }
  listeners.forEach(fn => fn());
}
export function useDensityPreference(key: string): [RibbonDensity, (value: RibbonDensity) => void] {
  const value = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => readDensity(key), () => 'compact' as const);
  return [value, next => writeDensity(key, next)];
}
/** Forget values cached for this visit (tests). */
export function resetDensityMemory() { memory.clear(); }

export const RibbonDensityContext = createContext<RibbonDensity>('expanded');
export const useRibbonDensity = () => useContext(RibbonDensityContext);
