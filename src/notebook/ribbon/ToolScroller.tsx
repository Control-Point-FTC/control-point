// The compact toolbar's one row: never wraps, scrolls sideways when the
// window is narrow (touch, trackpad, Shift+wheel or a plain wheel), hints at
// more tools with an edge fade, and moves focus with the arrow keys. Panels
// that open from a tool (emoji picker, drawing selection, saved revisions)
// are lifted out of the row so the scroll edge never clips them.
import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';
const POPOVERS = '.nb-picker, details[open] > .nb-popover-panel, details[open].nb-canvas-actions > div';

/** Places a panel just under its control, kept inside the window. */
export function placeBelow(anchor: Element, panel: HTMLElement) {
  const box = anchor.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.top = `${Math.round(box.bottom + 6)}px`;
  const width = panel.offsetWidth;
  const left = Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - width - 8));
  panel.style.left = `${Math.round(left)}px`;
  panel.style.right = 'auto';
}

function placePopovers(row: HTMLElement) {
  row.querySelectorAll<HTMLElement>(POPOVERS).forEach(panel => {
    const anchor = panel.classList.contains('nb-picker') ? panel.closest('.nb-picker-anchor') : panel.parentElement?.querySelector(':scope > summary');
    if (anchor) placeBelow(anchor, panel);
  });
}
function clearPlacement(row: HTMLElement) {
  row.querySelectorAll<HTMLElement>(POPOVERS).forEach(panel => { panel.style.position = panel.style.top = panel.style.left = panel.style.right = ''; });
}

export function ToolScroller({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = ref.current, edge = frame.current;
    if (!row || !edge || !compact) return;
    // The frame draws the fades; a mask on the row would also hide the
    // panels lifted out of it.
    const edges = () => {
      const max = row.scrollWidth - row.clientWidth;
      edge.toggleAttribute('data-more-start', row.scrollLeft > 2);
      edge.toggleAttribute('data-more-end', max - row.scrollLeft > 2);
    };
    const update = () => { edges(); placePopovers(row); };
    // A plain wheel scrolls the row sideways while the pointer is over it.
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || row.scrollWidth <= row.clientWidth) return;
      if ((event.target as Element).closest?.('.nb-picker, .nb-popover-panel, details[open] > div')) return;
      event.preventDefault();
      row.scrollLeft += event.deltaY;
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(row);
    const content = row.firstElementChild; if (content) resize?.observe(content);
    // Panels appear when React renders them or a <details> opens.
    const changes = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    changes?.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    row.addEventListener('scroll', update, { passive: true });
    row.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('resize', update);
    update();
    return () => {
      resize?.disconnect(); changes?.disconnect();
      row.removeEventListener('scroll', update); row.removeEventListener('wheel', wheel); window.removeEventListener('resize', update);
      edge.removeAttribute('data-more-start'); edge.removeAttribute('data-more-end'); clearPlacement(row);
    };
  }, [compact]);
  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const target = event.target as HTMLElement;
    // Text fields keep their arrow keys for the caret (lists use Up/Down, as in
    // the WAI-ARIA toolbar pattern); controls inside open panels do too.
    // A field gives way at its edges, so arrows carry on past it.
    const field = target.matches('input:not([type=color]):not([type=checkbox]):not([type=radio]), textarea') ? target as HTMLInputElement : null;
    const atEdge = !!field && field.selectionStart === field.selectionEnd && (event.key === 'ArrowRight' ? field.selectionEnd === field.value.length : event.key === 'ArrowLeft' && field.selectionStart === 0);
    if ((field && !atEdge) || target.closest('.nb-picker, .nb-popover-panel, details[open] > div')) return;
    const row = ref.current;
    if (!row) return;
    const controls = [...row.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('.nb-picker, .nb-popover-panel, details:not([open]) > :not(summary), details[open] > div, [hidden]'));
    const index = controls.indexOf(target.closest<HTMLElement>(FOCUSABLE) ?? target);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : Math.min(controls.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)));
    controls[next]?.focus();
  };
  return <div ref={frame} className="nb-tool-frame"><div ref={ref} className="nb-tool-scroll" data-compact={compact || undefined} onKeyDown={keys}>{children}</div></div>;
}
