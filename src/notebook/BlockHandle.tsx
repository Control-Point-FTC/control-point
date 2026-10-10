// The ⋮⋮ handle beside the block under the pointer: move it up or down,
// duplicate it, copy a link to it, or delete it. Keyboard: Alt+Shift+↑/↓.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { GripVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui-kit';
import { BLOCK_MENU_EVENT, blockIndexAt, currentBlockIndex, deleteBlock, duplicateBlock, moveBlock, runBlock } from './blockMoves';
import { notebookPageLink } from './pageLinks';

export function BlockHandle({ editor, pageId }: { editor: Editor | null; pageId: number }) {
  const [hover, setHover] = useState<{ index: number; id: string | null; top: number; left: number } | null>(null);
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
      const rect = el.getBoundingClientRect(), index = blockIndexAt(editor.state, pos);
      const id = editor.state.doc.maybeChild(index)?.attrs.id;
      setHover({ index, id: typeof id === 'string' ? id : null, top: rect.top + 2, left: rect.left - 30 });
    };
    // Alt+Shift+O: the menu for the block the cursor is in.
    const fromKeyboard = () => {
      const index = blockIndexAt(editor.state, editor.state.selection.from);
      const el = editor.view.nodeDOM(currentPos(index));
      if (!(el instanceof Element)) return;
      const rect = el.getBoundingClientRect(), id = editor.state.doc.maybeChild(index)?.attrs.id;
      setHover({ index, id: typeof id === 'string' ? id : null, top: rect.top + 2, left: rect.left - 30 });
      setMenuOpen(true);
    };
    const currentPos = (index: number) => { let pos = 0; for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize; return pos; };
    dom.addEventListener(BLOCK_MENU_EVENT, fromKeyboard);
    const onMove = (e: MouseEvent) => place(e.target);
    const onScroll = () => { if (!menuOpen) setHover(null); };
    dom.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, true);
    return () => { dom.removeEventListener('mousemove', onMove); dom.removeEventListener(BLOCK_MENU_EVENT, fromKeyboard); window.removeEventListener('scroll', onScroll, true); };
  }, [editor, menuOpen]);
  const live = <span className="sr-only" role="status" aria-live="polite">{status}</span>;
  if (!editor || !hover || !editor.isEditable) return status ? <>{live}<span className="nb-block-status">{status}</span></> : live;
  // The block may have moved (collaborators): act on where it is now.
  const target = currentBlockIndex(editor.state, hover);
  const block = target >= 0 ? editor.state.doc.child(target) : null;
  if (!block) return live;
  const run = (make: (state: import('@tiptap/pm/state').EditorState, index: number) => import('@tiptap/pm/state').Transaction | null) => {
    const index = currentBlockIndex(editor.state, hover);
    if (index >= 0) runBlock(editor, state => make(state, index)); else notify('That block was removed.');
    setMenuOpen(false); setHover(null);
  };
  const copyLink = async () => {
    const id = typeof block.attrs.id === 'string' ? block.attrs.id : null;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(new URL(notebookPageLink(pageId, id), window.location.origin).href);
      notify(id ? 'Link to this block copied.' : 'Link to this page copied.');
    } catch { notify('Copying isn’t available here.'); }
  };
  const last = editor.state.doc.childCount - 1;
  // Rendered outside the zoomed page so its screen position stays right at any zoom.
  return createPortal(<>{live}{status && <span className="nb-block-status">{status}</span>}<DropdownMenu modal={false} open={menuOpen} onOpenChange={open => { setMenuOpen(open); if (!open) editor.commands.focus(); }}>
    <DropdownMenuTrigger asChild>
      <button type="button" className="nb-block-handle" style={{ top: hover.top, left: hover.left }} aria-label="Block options" title="Block options (Alt+Shift+O) · Alt+Shift+↑/↓ moves the block" onMouseDown={e => e.preventDefault()}><GripVertical size={16} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem disabled={target === 0} onSelect={() => run((state, i) => moveBlock(state, i, -1))}>Move up</DropdownMenuItem>
      <DropdownMenuItem disabled={target >= last} onSelect={() => run((state, i) => moveBlock(state, i, 1))}>Move down</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => run((state, i) => duplicateBlock(state, i))}>Duplicate</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { void copyLink(); }}>Copy link to block</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-rose-500" onSelect={() => run((state, i) => deleteBlock(state, i))}>Delete block</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu></>, document.body);
}
