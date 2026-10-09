import React from 'react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { notebookExtensions } from '../editorSchema';
import { NotebookToolbar } from '../NotebookToolbar';
import { pasteNotebookText } from '../NotebookMobileToolbar';

let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); vi.unstubAllGlobals(); });
function mount() {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  editor = new Editor({ extensions: notebookExtensions(false), content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Original bold text', marks: [{ type: 'bold' }] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Desktop table' }] }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Edit here' }] },
  ] } });
  render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} />);
}
describe('mobile text-only notebook', () => {
  it('exposes exactly undo, redo, cut, copy and paste without desktop formatting tools', () => {
    mount(); expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Undo','Redo','Cut','Copy','Paste']);
    expect(screen.queryByRole('tablist')).toBeNull(); expect(screen.queryByLabelText('Font')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('status').textContent).toContain('Select some text first');
  });
  it('pastes literal text while preserving existing desktop formatting and tables', () => {
    mount(); const original = editor.getJSON(); editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    pasteNotebookText(editor, '<b>plain text</b>\nsecond line');
    const saved = editor.getJSON();
    expect(saved.content![0]).toEqual(original.content![0]); expect(saved.content![1]).toEqual(original.content![1]);
    expect(editor.getText()).toContain('<b>plain text</b>');
    expect(saved.content!.flatMap(n => n.content ?? []).filter(n => 'text' in n && n.text?.includes('plain text')).every(n => !n.marks?.length)).toBe(true);
  });
});
