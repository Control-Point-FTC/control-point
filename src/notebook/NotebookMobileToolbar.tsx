import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Undo2, Redo2, Scissors, Copy, ClipboardPaste } from 'lucide-react';
export function pasteNotebookText(editor: Editor, text: string) {
  if (!editor.isEditable || !text) return;
  editor.commands.insertContent(text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })));
}
export function NotebookMobileToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [notice, setNotice] = useState('');
  const copy = async (cut = false) => {
    const selection = editor.state.selection, doc = editor.state.doc;
    if (selection.empty) { setNotice('Select some text first.'); return; }
    try {
      await navigator.clipboard.writeText(doc.textBetween(selection.from, selection.to, '\n'));
      if (cut && editor.isEditable && !disabled && editor.state.doc.eq(doc) && editor.state.selection.eq(selection)) editor.chain().focus().deleteSelection().run();
      setNotice(cut ? editor.state.doc.eq(doc) ? 'Text copied. The selection changed before it could be cut.' : 'Text cut.' : 'Text copied.');
    } catch { setNotice('Use your device’s text-selection menu to copy or cut.'); }
  };
  return <div className="nb-mobile-toolbar" role="toolbar" aria-label="Text editing">
    <button aria-label="Undo" title="Undo" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={18} /></button>
    <button aria-label="Redo" title="Redo" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={18} /></button>
    <span className="nb-tool-divider" />
    <button aria-label="Cut" title="Cut" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => { void copy(true); }}><Scissors size={18} /></button>
    <button aria-label="Copy" title="Copy" onMouseDown={e => e.preventDefault()} onClick={() => { void copy(); }}><Copy size={18} /></button>
    <button aria-label="Paste" title="Paste" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={async () => {
      const doc = editor.state.doc, selection = editor.state.selection;
      try { const text = await navigator.clipboard.readText(); if (!editor.state.doc.eq(doc) || !editor.state.selection.eq(selection)) { setNotice('Your selection changed. Paste again at the current cursor.'); return; } pasteNotebookText(editor, text); editor.commands.focus(); setNotice('Text pasted.'); }
      catch { setNotice('Use your device’s text-selection menu to paste.'); }
    }}><ClipboardPaste size={18} /></button>
    {notice && <span role="status" className="nb-small">{notice}</span>}
  </div>;
}
