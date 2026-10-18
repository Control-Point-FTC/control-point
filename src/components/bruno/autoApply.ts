// "Auto-apply changes" (Bruno side panel): when on, the changes Bruno proposes in a reply
// that just finished are applied without the confirm click. Anything that deletes or
// removes still waits for the member. Saved per device; every open view follows a change.
import { useCallback, useEffect, useState } from 'react';

export const AUTO_APPLY_KEY = 'cp-bruno-auto-apply';
const EVENT = 'cp:bruno-auto-apply';
/** Used when the browser blocks storage, so the switch still holds for this tab. */
let memory: boolean | null = null;

export function readAutoApply(): boolean {
  try {
    const v = localStorage.getItem(AUTO_APPLY_KEY);
    return v === null ? memory ?? false : v === '1';
  } catch { return memory ?? false; }
}

export function useBrunoAutoApply(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readAutoApply);
  useEffect(() => {
    const sync = () => setOn(readAutoApply());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const set = useCallback((value: boolean) => {
    memory = value;
    try { if (value) localStorage.setItem(AUTO_APPLY_KEY, '1'); else localStorage.setItem(AUTO_APPLY_KEY, '0'); } catch { /* storage blocked: the in-memory value holds */ }
    setOn(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [on, set];
}

/** True when an action card's items delete or remove something (these always wait for a click).
 *  Covers `{ "remove": 17 }` (an id), `{ "delete": true }`, and op/action "delete". */
export function itemRemoves(it: unknown): boolean {
  if (!it || typeof it !== 'object') return false;
  const o = it as Record<string, unknown>;
  const set = (v: unknown) => v !== undefined && v !== null && v !== false;
  return set(o.remove) || set(o.delete) || set(o.removals) || o.op === 'delete' || o.op === 'remove' || o.action === 'delete' || o.action === 'remove';
}
