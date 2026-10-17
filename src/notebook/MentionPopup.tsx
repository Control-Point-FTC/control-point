// The list for "@" mentions, placed at the caret like the "[[" page-link list.
import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { insertMention, memberMatches, mentionKey, type MentionMember, type MentionState } from './mentionMenu';

export function MentionPopup({ editor, members, selfId, onMention }: { editor: Editor | null; members: MentionMember[]; selfId?: number; onMention: (m: MentionMember) => void }) {
  const [state, setState] = useState<MentionState | null>(null);
  const [, setTick] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest' }); }, [state?.index, state?.from, state?.query]);
  useEffect(() => {
    if (!editor) return;
    const update = () => { const next = editor.isDestroyed ? null : mentionKey.getState(editor.state) ?? null; setState(next?.active && editor.view.hasFocus() ? next : null); };
    const hide = () => setState(null);
    const follow = () => setTick(n => n + 1);
    editor.on('transaction', update); editor.on('focus', update); editor.on('blur', hide);
    window.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
    update();
    return () => { editor.off('transaction', update); editor.off('focus', update); editor.off('blur', hide); window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow); };
  }, [editor]);
  if (!editor || !state || !editor.isEditable) return null;
  const items = memberMatches(members, state.query, selfId);
  if (!items.length) return null;
  const selected = Math.min(state.index, items.length - 1);
  let at: { left: number; top: number; bottom: number };
  try { at = editor.view.coordsAtPos(state.to); } catch { return null; }
  const below = window.innerHeight - at.bottom - 12, above = at.top - 12;
  const downward = below >= 180 || below >= above;
  const maxHeight = Math.max(120, Math.min(320, downward ? below : above));
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 272));
  const place = downward ? { top: at.bottom + 6 } : { bottom: window.innerHeight - at.top + 6 };
  return <div ref={list} className="nb-link-menu" role="listbox" aria-label="Mention a teammate" style={{ left, maxHeight, ...place }}>
    {items.map((m, i) => <button key={m.id} type="button" role="option" aria-selected={i === selected}
      onMouseDown={e => { e.preventDefault(); insertMention(editor, state, m, onMention); }}
      onMouseEnter={() => editor.view.dispatch(editor.state.tr.setMeta(mentionKey, { index: i }))}>
      <strong>@{m.name}</strong>
    </button>)}
    <p className="nb-link-menu-help" aria-live="polite">Enter to mention and notify · Esc to close</p>
  </div>;
}
