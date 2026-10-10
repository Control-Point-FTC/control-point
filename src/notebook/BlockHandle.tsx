// The ⋮⋮ handle beside the block under the pointer: move it up or down,
// duplicate it, copy a link to it, or delete it. Keyboard: Alt+Shift+↑/↓.
import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { GripVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui-kit';
import { blockIndexAt, deleteBlock, duplicateBlock, moveBlock, runBlock } from './blockMoves';
import { notebookPageLink } from './pageLinks';

export function BlockHandle({ editor, pageId }: { editor: Editor | null; pageId: number }) {
  const [hover, setHover] = useState<{ index: number; top: number; left: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { if (!status) return; const t = window.setTimeout(() => setStatus(''), 2500); return () => window.clearTimeout(t); }, [status]);
  const notify = setStatus;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom as HTMLElement;
    const place = (target: EventTarget | null) => {
      if (menuOpen) return;
      let el = target instanceof Element ? target : null;
      while (el && el.parentElement !== dom) el = el.parentElement;
      if (!el || !editor.isEditable) return;
      let pos: number;
      try { pos = editor.view.posAtDOM(el, 0); } catch { return; }
      const rect = el.getBoundingClientRect();
      setHover({ index: blockIndexAt(editor.state, pos), top: rect.top + 2, left: rect.left - 30 });
    };
    const onMove = (e: MouseEvent) => place(e.target);
    const onScroll = () => { if (!menuOpen) setHover(null); };
    dom.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, true);
    return () => { dom.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll, true); };
  }, [editor, menuOpen]);
  const live = <span className="sr-only" role="status" aria-live="polite">{status}</span>;
  if (!editor || !hover || !editor.isEditable) return status ? <>{live}<span className="nb-block-status">{status}</span></> : live;
  const block = editor.state.doc.maybeChild(hover.index);
  if (!block) return null;
  const run = (make: Parameters<typeof runBlock>[1]) => { runBlock(editor, make); setMenuOpen(false); setHover(null); };
  const copyLink = async () => {
    const id = typeof block.attrs.id === 'string' ? block.attrs.id : null;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(new URL(notebookPageLink(pageId, id), window.location.origin).href);
      notify(id ? 'Link to this block copied.' : 'Link to this page copied.');
    } catch { notify('Copying isn’t available here.'); }
  };
  const last = editor.state.doc.childCount - 1;
  return <>{live}{status && <span className="nb-block-status">{status}</span>}<DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
    <DropdownMenuTrigger asChild>
      <button type="button" className="nb-block-handle" style={{ top: hover.top, left: hover.left }} aria-label="Block options" title="Block options (Alt+Shift+↑/↓ moves the block)" onMouseDown={e => e.preventDefault()}><GripVertical size={16} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem disabled={hover.index === 0} onSelect={() => run(state => moveBlock(state, hover.index, -1))}>Move up</DropdownMenuItem>
      <DropdownMenuItem disabled={hover.index >= last} onSelect={() => run(state => moveBlock(state, hover.index, 1))}>Move down</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => run(state => duplicateBlock(state, hover.index))}>Duplicate</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { void copyLink(); }}>Copy link to block</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-rose-500" onSelect={() => run(state => deleteBlock(state, hover.index))}>Delete block</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu></>;
}
