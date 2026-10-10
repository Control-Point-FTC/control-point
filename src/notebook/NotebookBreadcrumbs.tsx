// Where am I, and how do I get back? A breadcrumb trail above the open page
// (notebook › section › parent pages › page) with Back and Forward through
// the pages opened in this visit.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import type { NotebookPageItem, NotebookTree } from './types';

export type PageTrail = { notebook?: string; section?: string; ancestors: NotebookPageItem[]; page?: NotebookPageItem };

/** The path to a page through the visible tree. */
export function pageTrail(tree: NotebookTree, pageId: number): PageTrail {
  const page = tree.pages.find(p => p.id === pageId);
  if (!page) return { ancestors: [] };
  const section = tree.sections.find(s => s.id === page.sectionId);
  const notebook = tree.notebooks.find(n => n.id === section?.notebookId);
  const ancestors: NotebookPageItem[] = [];
  const seen = new Set([page.id]);
  for (let parent = page.parentId; parent !== null && ancestors.length < 12;) {
    const item = tree.pages.find(p => p.id === parent);
    if (!item || seen.has(item.id)) break;
    seen.add(item.id); ancestors.unshift(item); parent = item.parentId;
  }
  return { notebook: notebook?.title, section: section?.title, ancestors, page };
}

const HISTORY_LIMIT = 50;

/** Back/forward through the pages opened in this visit. Pages that are gone
 *  from the tree are skipped. `open` returns false when navigation was
 *  cancelled (e.g. the person chose to keep editing). */
export function usePageHistory(selected: number | null, exists: (id: number) => boolean, open: (id: number) => Promise<boolean>) {
  const history = useRef({ stack: [] as number[], index: -1, jumping: null as number | null, moving: false });
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!selected) return;
    const h = history.current;
    if (h.jumping === selected) h.jumping = null;
    else if (h.stack[h.index] !== selected) {
      h.stack = [...h.stack.slice(0, h.index + 1), selected].slice(-HISTORY_LIMIT);
      h.index = h.stack.length - 1;
    }
    rerender(n => n + 1);
  }, [selected]);
  const target = (step: -1 | 1) => {
    const h = history.current;
    for (let i = h.index + step; i >= 0 && i < h.stack.length; i += step) if (exists(h.stack[i]) && h.stack[i] !== selected) return i;
    return -1;
  };
  // One move at a time: a second click while the first is still leaving the
  // page (e.g. saving) is ignored, so positions can't cross.
  const go = useCallback(async (step: -1 | 1) => {
    const h = history.current, i = target(step);
    if (i < 0 || h.moving) return;
    const before = h.index, page = h.stack[i];
    h.index = i; h.jumping = page; h.moving = true; rerender(n => n + 1);
    try {
      // Cancelled: go back to where we were, unless something newer moved us.
      if (!await open(page) && h.jumping === page) { h.index = before; h.jumping = null; }
    } finally { h.moving = false; rerender(n => n + 1); }
  }, [open, selected, exists]); // eslint-disable-line react-hooks/exhaustive-deps -- target reads the ref
  const moving = history.current.moving;
  return { canBack: !moving && target(-1) >= 0, canForward: !moving && target(1) >= 0, back: () => go(-1), forward: () => go(1) };
}

export function NotebookBreadcrumbs({ trail, canBack, canForward, onBack, onForward, onOpen }: {
  trail: PageTrail; canBack: boolean; canForward: boolean; onBack: () => void; onForward: () => void; onOpen: (id: number) => void;
}) {
  if (!trail.page) return null;
  const sep = <ChevronRight size={12} aria-hidden="true" className="nb-crumb-sep" />;
  return <nav className="nb-breadcrumbs" aria-label="Page location">
    <button type="button" className="nb-crumb-nav" aria-label="Back to the previous page" title="Back" disabled={!canBack} onClick={onBack}><ArrowLeft size={15} /></button>
    <button type="button" className="nb-crumb-nav" aria-label="Forward to the next page" title="Forward" disabled={!canForward} onClick={onForward}><ArrowRight size={15} /></button>
    <ol>
      {trail.notebook && <li><span>{trail.notebook}</span>{sep}</li>}
      {trail.section && <li><span>{trail.section}</span>{sep}</li>}
      {trail.ancestors.map(p => <li key={p.id}><button type="button" onClick={() => onOpen(p.id)}>{p.title || 'Untitled'}</button>{sep}</li>)}
      <li><span aria-current="page">{trail.page.title || 'Untitled'}</span></li>
    </ol>
  </nav>;
}
