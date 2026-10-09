import React from 'react';
import { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notebookExtensions } from '../editorSchema';
import { NotebookDiscussions, selectionCommentAnchor } from '../NotebookDiscussions';
import { NotebookSync } from '../NotebookSync';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const editors: Editor[] = [], providers: NotebookSync[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => e.destroy()); providers.splice(0).forEach(p => p.destroy()); vi.restoreAllMocks(); vi.resetAllMocks(); });
function mount(canComment = true) {
  const editor = new Editor({ extensions: notebookExtensions(), content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'saved-drive-block' }, content: [{ type: 'text', text: 'Drive testing' }] }] } }); editors.push(editor);
  const sync = new NotebookSync(7); providers.push(sync); sync.status = 'saved';
  vi.mocked(apiJson).mockImplementation(async url => url.endsWith('/mention-members') ? [{ id: 4, name: 'Lee' }] as any : { items: [], next: null, canComment } as any);
  render(<MemoryRouter><NotebookDiscussions sync={sync} editor={editor} /></MemoryRouter>);
  return { sync, editor };
}
describe('notebook discussions in the mounted editor', () => {
  it('anchors selected text to a persisted block ID rather than an absolute page offset', () => {
    const { editor } = mount(); editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(selectionCommentAnchor(editor)).toMatchObject({ kind: 'text', targetId: editor.getJSON().content![0].attrs!.id, start: 0, end: 5, quote: 'Drive' });
    editor.commands.setTextSelection(7); expect(selectionCommentAnchor(editor).kind).toBe('block');
  });
  it('preserves the draft and avoids posting a comment before its anchor reaches the server', async () => {
    const { sync } = mount(); await screen.findByRole('textbox', { name: 'New discussion' });
    sync.doc.getMap('meta').set('title', 'Unsent'); vi.spyOn(sync, 'flush').mockResolvedValue(false);
    fireEvent.change(screen.getByRole('textbox', { name: 'New discussion' }), { target: { value: 'Check the drivetrain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post discussion' }));
    await screen.findByText(/Save the page before adding/);
    expect((screen.getByRole('textbox', { name: 'New discussion' }) as HTMLTextAreaElement).value).toBe('Check the drivetrain');
    expect(vi.mocked(apiJson).mock.calls.some(([url]) => url.endsWith('/comments'))).toBe(false);
  });
  it('posts an anchored comment with explicitly selected, permission-filtered recipients', async () => {
    const { editor } = mount(); await screen.findByRole('textbox', { name: 'New discussion' });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    fireEvent.click(screen.getByRole('button', { name: 'Anchor to selected text or block' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New discussion' }), { target: { value: 'Please inspect' } });
    fireEvent.click(screen.getByText('Mention teammates'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lee' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post discussion' }));
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.some(([url]) => url.endsWith('/comments'))).toBe(true));
    const call = vi.mocked(apiJson).mock.calls.find(([url]) => url.endsWith('/comments'))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ body: 'Please inspect', mentions: [4], anchor: { kind: 'text', quote: 'Drive' } });
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'New discussion' }) as HTMLTextAreaElement).value).toBe(''));
  });
  it('allows readers to view discussions without exposing a comment composer', async () => {
    mount(false); await screen.findByText(/Comments require notebook editing permission/);
    expect(screen.queryByRole('textbox', { name: 'New discussion' })).toBeNull();
  });
});
