// The bottom-right corner is shared by the bug button, the install banner,
// the @mention card and toasts. Each card that can be on screen reserves its
// measured height in a CSS variable while it's shown; the next card up adds
// those heights to its own bottom offset, so cards stack instead of covering
// each other. Order, bottom to top: bug button, install banner, mention card,
// toasts (see .cp-slot-* in index.css and the Toaster offsets).
import { useEffect, type RefObject } from 'react';

export type CornerSlot = 'banner' | 'mention';

export function useCornerSlot(slot: CornerSlot, ref: RefObject<HTMLElement | null>, visible: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const name = `--cp-slot-${slot}`;
    const el = ref.current;
    if (!visible || !el) { root.style.removeProperty(name); return; }
    const set = () => root.style.setProperty(name, `${Math.ceil(el.getBoundingClientRect().height) + 12}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty(name); };
  }, [slot, ref, visible]);
}
