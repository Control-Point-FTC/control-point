// The floating list for the "/" menu, placed under the caret.
import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { slashKey, slashMatches, type SlashState } from './slashMenu';

export function SlashMenuPopup({ editor }: { editor: Editor | null }) {
  const [state, setState] = useState<SlashState | null>(null);
  useEffect(() => {
    if (!editor) return;
    // Shown only while the page has focus; clicking away hides it.
    const update = () => { const next = editor.isDestroyed ? null : slashKey.getState(editor.state) ?? null; setState(next?.active && editor.view.hasFocus() ? next : null); };
    const hide = () => setState(null);
    editor.on('transaction', update); editor.on('focus', update); editor.on('blur', hide);
    return () => { editor.off('transaction', update); editor.off('focus', update); editor.off('blur', hide); };
  }, [editor]);
  if (!editor || !state) return null;
  const items = slashMatches(state.query);
  let at: { left: number; bottom: number };
  try { at = editor.view.coordsAtPos(state.to); } catch { return null; }
  const left = Math.min(at.left, window.innerWidth - 280), top = Math.min(at.bottom + 6, window.innerHeight - 40);
  return <div className="nb-slash-menu" role="listbox" aria-label="Insert a block" style={{ left, top }}>
    {items.map((item, i) => <button key={item.id} type="button" role="option" aria-selected={i === state.index}
      onMouseDown={e => { e.preventDefault(); item.run(editor, { from: state.from, to: state.to }); }}
      onMouseEnter={() => editor.view.dispatch(editor.state.tr.setMeta(slashKey, { index: i }))}>
      <strong>{item.label}</strong><span>{item.hint}</span>
    </button>)}
    <p className="nb-slash-help" aria-live="polite">{items.length} {items.length === 1 ? 'block' : 'blocks'} · ↑↓ to choose · Enter to insert · Esc to close</p>
  </div>;
}
