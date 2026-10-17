import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** localStorage key for the pages pane width the member dragged to (per device). */
export const PAGES_WIDTH_KEY = 'cp-nb-pages-width';
export const PAGES_MIN_WIDTH = 180;
export const PAGES_MAX_WIDTH = 640;

const windowWidth = () => (typeof window === 'undefined' ? 1600 : window.innerWidth);

/** The widest the pages pane may be in this window: the cap, or half the window if that's less. */
export function paneMaxWidth(viewport: number = windowWidth()): number {
  return Math.max(PAGES_MIN_WIDTH, Math.min(PAGES_MAX_WIDTH, Math.floor(viewport * 0.5)));
}

/** Keeps a pane width usable: never below the minimum, never past paneMaxWidth. */
export function clampPaneWidth(w: number, viewport: number = windowWidth()): number {
  return Math.round(Math.min(Math.max(w, PAGES_MIN_WIDTH), paneMaxWidth(viewport)));
}

function readWidth(): number | null {
  try {
    const n = Number(window.localStorage.getItem(PAGES_WIDTH_KEY));
    // Only the absolute limits here: the window decides what's shown (see usePagesPaneWidth).
    return Number.isFinite(n) && n > 0 ? clampPaneWidth(n, Infinity) : null;
  } catch { return null; }
}

/**
 * The pages pane width: null means the stylesheet's default. The chosen width is saved per
 * device; what's shown is re-fitted to the window as it resizes, so a narrower window never
 * squeezes the page out (and widening it again brings the chosen width back).
 */
export function usePagesPaneWidth(): [number | null, (w: number | null) => void] {
  const [width, setWidth] = useState<number | null>(readWidth);
  const [viewport, setViewport] = useState(windowWidth);
  useEffect(() => {
    const on = () => setViewport(windowWidth());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const set = useCallback((w: number | null) => {
    const v = w === null ? null : clampPaneWidth(w);
    setWidth(v);
    try {
      if (v === null) window.localStorage.removeItem(PAGES_WIDTH_KEY);
      else window.localStorage.setItem(PAGES_WIDTH_KEY, String(v));
    } catch { /* storage blocked: the width still applies this visit */ }
  }, []);
  return [width === null ? null : clampPaneWidth(width, viewport), set];
}

/**
 * The draggable divider between the pages pane and the page. Drag it, or focus it and use
 * the arrow keys; double-click or Home puts the default width back.
 */
export function NotebookPaneResizer({ paneRef, width, onWidth }: { paneRef: RefObject<HTMLElement | null>; width: number | null; onWidth: (w: number | null) => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const current = () => width ?? (paneRef.current?.getBoundingClientRect().width || 300);

  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('nb-resizing');
    return () => document.body.classList.remove('nb-resizing');
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize pages list"
      aria-valuemin={PAGES_MIN_WIDTH}
      aria-valuemax={paneMaxWidth()}
      aria-valuenow={Math.round(current())}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={`nb-pane-resizer nb-desktop${dragging ? ' is-dragging' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { x: e.clientX, w: current() };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onWidth(drag.current.w + e.clientX - drag.current.x);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onDoubleClick={() => onWidth(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(current() - step); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(current() + step); }
        else if (e.key === 'Home') { e.preventDefault(); onWidth(null); }
      }}
    />
  );
}
