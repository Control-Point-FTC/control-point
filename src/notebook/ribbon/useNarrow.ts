// The notebook's top rows adapt to the width they actually get, not the
// window's: the Bruno panel, split view or the sidebar can leave a wide
// window with a narrow notebook. Sets `data-narrow` / `data-tight` on the
// element below each limit (no re-render; CSS does the rest). Only layout
// changes: the member's compact/expanded choice is never touched.
import { useEffect, type RefObject } from 'react';

export type WidthLimits = { narrow: number; tight?: number };

export function useNarrow(ref: RefObject<HTMLElement | null>, limits: WidthLimits) {
  const { narrow, tight = 0 } = limits;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = (width: number) => {
      el.toggleAttribute('data-narrow', width > 0 && width < narrow);
      el.toggleAttribute('data-tight', width > 0 && width < tight);
    };
    const observer = new ResizeObserver(entries => { for (const entry of entries) update(entry.contentRect.width); });
    observer.observe(el);
    update(el.getBoundingClientRect().width);
    return () => { observer.disconnect(); el.removeAttribute('data-narrow'); el.removeAttribute('data-tight'); };
  }, [ref, narrow, tight]);
}

/** The tool row folds its tabs into "Home ▾" below this width. */
export const TOOL_ROW_LIMITS: WidthLimits = { narrow: 1100 };
/** The page bar drops button labels below `narrow`, and the notebook and
 *  section names (kept in the explorer) below `tight`. */
export const PAGE_BAR_LIMITS: WidthLimits = { narrow: 1120, tight: 760 };
