import React from 'react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotebookToolbar } from '../NotebookToolbar';
import { notebookExtensions } from '../editorSchema';
import { wordAtSelection } from '../ribbon/Thesaurus';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); vi.resetAllMocks(); localStorage.clear(); });
const senses = { word: 'big', senses: [{ partOfSpeech: 'Adjective', definition: 'above average in size', synonyms: ['large', 'sizable'] }] };
function mount(html: string) {
  editor = new Editor({ extensions: notebookExtensions(false, true), content: html });
  render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} />);
  editor.commands.focus();
}

describe('Thesaurus', () => {
  it('finds the word at the cursor or the selected word', () => {
    editor = new Editor({ extensions: notebookExtensions(false, true), content: '<p>A big shiny robot</p>' });
    editor.commands.setTextSelection(4);
    expect(wordAtSelection(editor)).toMatchObject({ word: 'big' });
    editor.commands.setTextSelection({ from: 13, to: 18 });
    expect(wordAtSelection(editor)).toMatchObject({ word: 'robot' });
    // A double-click that also caught the trailing space still targets just the word.
    editor.commands.setTextSelection({ from: 3, to: 7 });
    expect(wordAtSelection(editor)).toEqual({ word: 'big', from: 3, to: 6 });
    editor.commands.setTextSelection({ from: 1, to: 18 });
    expect(wordAtSelection(editor)).toBeNull();
  });

  it('looks up the word, shows senses with definitions, and replaces it keeping its case', async () => {
    vi.mocked(apiJson).mockResolvedValue(senses as any);
    mount('<p>Big robot</p>');
    editor.commands.setTextSelection(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thesaurus' }));
    expect(await screen.findByText('above average in size')).toBeTruthy();
    expect(String(vi.mocked(apiJson).mock.calls[0][0])).toBe('/api/notebook/thesaurus?word=Big');
    fireEvent.click(screen.getByRole('button', { name: 'Insert “large”' }));
    expect(editor.getText()).toBe('Large robot');
  });

  it('follows the word through edits elsewhere, and refuses once the word itself changed', async () => {
    vi.mocked(apiJson).mockResolvedValue(senses as any);
    mount('<p>big robot</p>');
    editor.commands.setTextSelection(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thesaurus' }));
    await screen.findByText('above average in size');
    act(() => { editor.commands.insertContentAt(1, 'A '); });
    fireEvent.click(screen.getByRole('button', { name: 'Insert “large”' }));
    expect(editor.getText()).toBe('A large robot');
    // Now edit the replaced word itself: Insert refuses instead of guessing.
    act(() => { editor.commands.insertContentAt(4, 'r'); });
    fireEvent.click(screen.getByRole('button', { name: 'Insert “sizable”' }));
    expect(editor.getText()).toBe('A lrarge robot');
    expect(screen.getByText(/The word changed/)).toBeTruthy();
  });

  it('explains when there are no synonyms or no connection', async () => {
    vi.mocked(apiJson).mockResolvedValueOnce({ word: 'qwxzv', senses: [] } as any);
    mount('<p>qwxzv</p>');
    editor.commands.setTextSelection(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thesaurus' }));
    expect(await screen.findByText(/No synonyms for/)).toBeTruthy();
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Word to look up' }), { target: { value: 'robot' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByText(/needs a connection/)).toBeTruthy();
  });
});

describe('Thesaurus review fixes', () => {
  it('finds the right word after a line break', () => {
    editor = new Editor({ extensions: notebookExtensions(false, true), content: '<p>Notes<br>big robot</p>' });
    const start = editor.state.doc.textBetween(0, editor.state.doc.content.size, '|', '|').indexOf('big');
    // Cursor inside "big" (after the break): the range covers exactly "big".
    let pos = 0;
    editor.state.doc.descendants((n, p) => { if (n.isText && n.text?.startsWith('big')) pos = p; });
    editor.commands.setTextSelection(pos + 1);
    const at = wordAtSelection(editor)!;
    expect(at.word).toBe('big');
    expect(editor.state.doc.textBetween(at.from, at.to)).toBe('big');
    expect(start).toBeGreaterThan(0);
  });

  it('only the newest lookup updates the panel', async () => {
    const pending: ((v: unknown) => void)[] = [];
    vi.mocked(apiJson).mockImplementation(() => new Promise(r => { pending.push(r); }) as any);
    mount('<p>big</p>');
    editor.commands.setTextSelection(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thesaurus' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Word to look up' }), { target: { value: 'robot' } });
    fireEvent.submit(screen.getByRole('search'));
    await act(async () => { pending[1]({ word: 'robot', senses: [{ partOfSpeech: 'Noun', definition: 'a machine', synonyms: ['automaton'] }] }); });
    await act(async () => { pending[0](senses); });
    expect(screen.getByText('a machine')).toBeTruthy();
    expect(screen.queryByText('above average in size')).toBeNull();
  });

  it('follows the word through remote Yjs edits and refuses when a collaborator changes it', async () => {
    const { prosemirrorJSONToYDoc } = await import('@tiptap/y-tiptap');
    const { default: Collaboration } = await import('@tiptap/extension-collaboration');
    const Y = await import('yjs');
    const { notebookSchema } = await import('../editorSchema');
    const local = prosemirrorJSONToYDoc(notebookSchema, { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'p' }, content: [{ type: 'text', text: 'big robot' }] }] }, 'prosemirror');
    const remote = new Y.Doc(); Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const sync = () => Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(local)));
    const remoteText = () => ((remote.getXmlFragment('prosemirror').get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>);
    vi.mocked(apiJson).mockResolvedValue(senses as any);
    editor = new Editor({ extensions: [...notebookExtensions(true, true), Collaboration.configure({ document: local, field: 'prosemirror' })] });
    render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} />);
    editor.commands.setTextSelection(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thesaurus' }));
    await screen.findByText('above average in size');
    // A collaborator types before and after the word.
    act(() => { remoteText().insert(0, 'A '); remoteText().insert(remoteText().length, '!'); sync(); });
    fireEvent.click(screen.getByRole('button', { name: 'Insert “large”' }));
    expect(editor.getText()).toBe('A large robot!');
    // Now the collaborator edits the word itself.
    act(() => { Y.applyUpdate(remote, Y.encodeStateAsUpdate(local, Y.encodeStateVector(remote))); remoteText().insert(4, 'X'); sync(); });
    fireEvent.click(screen.getByRole('button', { name: 'Insert “sizable”' }));
    expect(editor.getText()).toBe('A laXrge robot!');
    expect(screen.getByText(/The word changed/)).toBeTruthy();
  });
});
