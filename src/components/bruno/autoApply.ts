// "Auto-apply changes" (Bruno side panel): when on, the changes Bruno proposes in a reply
// that just finished are applied without the confirm click. Anything that deletes or
// removes still waits for the member. Saved per device; every open view follows a change.
import { useCallback, useEffect, useState } from 'react';

export const AUTO_APPLY_KEY = 'cp-bruno-auto-apply';
const EVENT = 'cp:bruno-auto-apply';

export function readAutoApply(): boolean {
  try { return localStorage.getItem(AUTO_APPLY_KEY) === '1'; } catch { return false; }
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
    try { if (value) localStorage.setItem(AUTO_APPLY_KEY, '1'); else localStorage.removeItem(AUTO_APPLY_KEY); } catch { /* storage blocked: this view only */ }
    setOn(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [on, set];
}
