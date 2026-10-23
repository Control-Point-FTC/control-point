import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { NotebookPolish, POLISH_KEEP, applyPolish, selectedTopBlocks, type Polished } from '../NotebookPolish';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const editors: Editor[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => e.destroy()); vi.resetAllMocks(); });

const para = (id: string, text: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const file = { type: 'notebookFile', attrs: { id: 'pic', fileId: 9, name: 'intake.png', mimeType: 'image/png', size: 10, display: 'image', width: 640 } };
function editorWith(content: any[]) {
  const editor = new Editor({ extensions: notebookExtensions(false, true), content: { type: 'doc', content } });
  editors.push(editor); return editor;
}
const snapshot = (editor: Editor) => JSON.stringify((editor.getJSON().content ?? []).map((n: any) => editor.schema.nodeFromJSON(n).toJSON()));
const polished = (over: Partial<Polished> = {}): Polished => ({ pageId: 1, revision: 3, blocks: ['a', 'pic', 'b'], dropped: [], added: ['meeting'], content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting' }] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Order 2 rollers' }] }] }] },
  { type: POLISH_KEEP, attrs: { id: 'pic' } },
  { type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'test nov 1' }] },
], ...over });

describe('applying a polish', () => {
  it('replaces the polished blocks in one undoable edit and keeps the picture node itself', () => {
    const editor = editorWith([para('a', 'meeting: order 2 rollers'), file, para('b', 'test nov 1')]);
    const before = editor.getJSON();
    expect(applyPolish(editor, polished(), snapshot(editor))).toBeNull();
    const after = editor.getJSON().content!;
    expect(after.map(n => n.type)).toEqual(['heading', 'taskList', 'notebookFile', 'paragraph']);
    expect(after[2]).toEqual(before.content![1]); // the picture, untouched
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });

  it('refuses when the page changed after Bruno read it', () => {
    const editor = editorWith([para('a', 'meeting: order 2 rollers'), file, para('b', 'test nov 1')]);
    const old = snapshot(editor);
    editor.commands.insertContentAt(1, 'edited ');
    expect(applyPolish(editor, polished(), old)).toMatch(/changed while Bruno worked/);
    expect(editor.getJSON().content!.map(n => n.type)).toEqual(['paragraph', 'notebookFile', 'paragraph']);
  });

  it('polishes only the top-level blocks a selection touches', () => {
    const editor = editorWith([para('a', 'one'), para('b', 'two'), para('c', 'three')]);
    expect(selectedTopBlocks(editor)).toBeNull();
    editor.commands.setTextSelection({ from: 7, to: 9 });
    expect(selectedTopBlocks(editor)).toEqual(['b']);
    editor.commands.setTextSelection({ from: 2, to: 9 });
    expect(selectedTopBlocks(editor)).toEqual(['a', 'b']);
  });
});

describe('Polish with Bruno dialog', () => {
  const sync: any = { pageId: 1, scope: { teamId: 2 }, pending: false, data: { revision: 3, protected: false }, flush: vi.fn() };
  it('previews Bruno’s version, shows what to check, and applies only on Apply', async () => {
    const editor = editorWith([para('a', 'meeting: order 2 rollers maya'), file, para('b', 'test nov 1')]);
    vi.mocked(apiJson).mockResolvedValue(polished({ dropped: ['maya'] }));
    render(<NotebookPolish sync={sync} editor={editor as any} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Polish with Bruno' }));
    const preview = await screen.findByRole('region', { name: 'Polished version' });
    expect(preview.querySelector('h2')?.textContent).toBe('Meeting');
    expect(vi.mocked(apiJson).mock.calls[0][0]).toBe('/api/notebook/pages/1/polish');
    expect(JSON.parse(String(vi.mocked(apiJson).mock.calls[0][1]?.body))).toEqual({ revision: 3 });
    expect(screen.getByRole('alert')).toHaveTextContent('Not found in Bruno’s version: maya');
    expect(editor.getJSON().content![0].type).toBe('paragraph'); // nothing changed yet
    fireEvent.click(screen.getByRole('tab', { name: 'Original' }));
    expect(screen.getByRole('region', { name: 'Original version' }).textContent).toContain('meeting: order 2 rollers maya');
    fireEvent.click(screen.getByRole('button', { name: 'Apply anyway' }));
    await waitFor(() => expect(editor.getJSON().content![0].type).toBe('heading'));
  });

  it('is off on admin-only pages, which Bruno never reads', () => {
    const editor = editorWith([para('a', 'x')]);
    render(<NotebookPolish sync={{ ...sync, data: { revision: 3, protected: true } }} editor={editor as any} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Polish with Bruno' })).toBeDisabled();
  });
});
