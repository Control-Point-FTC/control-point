// The floating list for the "/" menu, placed under the caret.
import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { slashKey, slashMatches, type SlashState } from './slashMenu';

export function SlashMenuPopup({ editor }: { editor: Editor | null }) {
  const [state, setState] = useState<SlashState | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    // Shown only while the page has focus; clicking away hides it.
    const update = () => { const next = editor.isDestroyed ? null : slashKey.getState(editor.state) ?? null; setState(next?.active && editor.view.hasFocus() ? next : null); };
    const hide = () => setState(null);
    // Scrolling or resizing moves the caret; follow it.
    const follow = () => setTick(n => n + 1);
    editor.on('transaction', update); editor.on('focus', update); editor.on('blur', hide);
    window.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
    return () => { editor.off('transaction', update); editor.off('focus', update); editor.off('blur', hide); window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow); };
  }, [editor]);
  if (!editor || !state) return null;
  const items = slashMatches(state.query);
  let at: { left: number; top: number; bottom: number };
  try { at = editor.view.coordsAtPos(state.to); } catch { return null; }
  // Below the caret when there's room, otherwise above; never off-screen.
  const below = window.innerHeight - at.bottom - 12, above = at.top - 12;
  const downward = below >= 180 || below >= above;
  const maxHeight = Math.max(120, Math.min(320, downward ? below : above));
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 272));
  const place = downward ? { top: at.bottom + 6 } : { bottom: window.innerHeight - at.top + 6 };
  return <div className="nb-slash-menu" role="listbox" aria-label="Insert a block" style={{ left, maxHeight, ...place }}>
    {items.map((item, i) => <button key={item.id} type="button" role="option" aria-selected={i === state.index}
      onMouseDown={e => { e.preventDefault(); item.run(editor, { from: state.from, to: state.to }); }}
      onMouseEnter={() => editor.view.dispatch(editor.state.tr.setMeta(slashKey, { index: i }))}>
      <strong>{item.label}</strong><span>{item.hint}</span>
    </button>)}
    <p className="nb-slash-help" aria-live="polite">{items.length} {items.length === 1 ? 'block' : 'blocks'} · ↑↓ to choose · Enter to insert · Esc to close</p>
  </div>;
}
