import React from 'react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { notebookExtensions } from '../editorSchema';
import { NotebookToolbar } from '../NotebookToolbar';
import { pasteNotebookText } from '../pasteText';

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
describe('phone notebook toolbar', () => {
  it('is the compact ribbon: a tab menu and one row of tools, without the computer-only Draw and View tabs', () => {
    mount();
    expect(screen.getByRole('toolbar', { name: 'Home commands' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['File', 'Home', 'Insert', 'History', 'Review', 'Help']);
    expect(screen.getByRole('button', { name: 'Commands: Home' })).toBeTruthy();
    for (const name of ['Undo', 'Redo', 'Paste', 'Bold', 'Italic', 'Underline', 'Lists', 'Alignment']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getByLabelText('Font')).toBeTruthy();
    // Cut and copy live in the Paste menu; copying with nothing selected explains why.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Paste options' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
    expect(screen.getByRole('status').textContent).toContain('Select something first');
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
