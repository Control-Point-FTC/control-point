// The list for "[[" page links, placed at the caret (above it when there's
// no room below) and kept in place while the page scrolls.
import React, { createContext, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { insertPageLink, pageLinkKey, pageMatches, type PageLinkSource, type PageLinkState } from './pageLinkMenu';

export const PageLinkSourceContext = createContext<PageLinkSource | null>(null);
import type { NotebookPageItem } from './types';

export function PageLinkPopup({ editor, pages, currentPageId }: { editor: Editor | null; pages: NotebookPageItem[]; currentPageId: number }) {
  const [state, setState] = useState<PageLinkState | null>(null);
  const [, setTick] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // Keep the highlighted page visible as arrow keys move through a short list.
  // Only when the choice or the query changes, never because the list itself was scrolled.
  useEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest' }); }, [state?.index, state?.from, state?.query]);
  useEffect(() => {
    if (!editor) return;
    const update = () => { const next = editor.isDestroyed ? null : pageLinkKey.getState(editor.state) ?? null; setState(next?.active && editor.view.hasFocus() ? next : null); };
    const hide = () => setState(null);
    const follow = () => setTick(n => n + 1);
    editor.on('transaction', update); editor.on('focus', update); editor.on('blur', hide);
    window.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
    // Switching editors (page text ↔ a canvas text box) happens after that
    // editor's focus event, so read its state now.
    update();
    return () => { editor.off('transaction', update); editor.off('focus', update); editor.off('blur', hide); window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow); };
  }, [editor]);
  if (!editor || !state || !editor.isEditable) return null;
  const items = pageMatches(pages, state.query, currentPageId);
  if (!items.length) return null;
  const selected = Math.min(state.index, items.length - 1);
  let at: { left: number; top: number; bottom: number };
  try { at = editor.view.coordsAtPos(state.to); } catch { return null; }
  const below = window.innerHeight - at.bottom - 12, above = at.top - 12;
  const downward = below >= 180 || below >= above;
  const maxHeight = Math.max(120, Math.min(320, downward ? below : above));
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 272));
  const place = downward ? { top: at.bottom + 6 } : { bottom: window.innerHeight - at.top + 6 };
  return <div ref={list} className="nb-link-menu" role="listbox" aria-label="Link a page" style={{ left, maxHeight, ...place }}>
    {items.map((page, i) => <button key={page.id} type="button" role="option" aria-selected={i === selected}
      onMouseDown={e => { e.preventDefault(); insertPageLink(editor, state, page); }}
      onMouseEnter={() => editor.view.dispatch(editor.state.tr.setMeta(pageLinkKey, { index: i }))}>
      <strong>{page.title || 'Untitled'}</strong>{page.protected && <span>Admin only</span>}
    </button>)}
    <p className="nb-link-menu-help" aria-live="polite">{items.length} {items.length === 1 ? 'page' : 'pages'} · Enter to link · Esc to close</p>
  </div>;
}
