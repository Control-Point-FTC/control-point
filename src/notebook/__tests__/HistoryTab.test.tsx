import React from 'react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotebookToolbar } from '../NotebookToolbar';
import { notebookExtensions } from '../editorSchema';
import { NotebookWorkspaceContext, type NotebookWorkspace } from '../workspaceContext';
import { apiJson } from '../../services/api';
import type { NotebookTree } from '../types';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));

let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); vi.resetAllMocks(); localStorage.clear(); });
const tree: NotebookTree = {
  notebooks: [{ id: 1, title: 'Book', color: null, sort: 0 }],
  sections: [{ id: 5, notebookId: 1, title: 'Build', color: null, sort: 0, protected: false, defaultTemplate: null, dateStamp: false }],
  pages: [{ id: 9, sectionId: 5, parentId: null, title: 'Drive', sort: 0, protected: false, ownProtected: false, revision: 3, updatedAt: 'now', unread: true }],
  permissions: { read: true, edit: true, organize: true, delete: true, protect: false },
};
function mount(workspace: Partial<NotebookWorkspace> = {}) {
  editor = new Editor({ extensions: notebookExtensions(false, true), content: '<p>x</p>' });
  const value: NotebookWorkspace = { teamId: 7, tree, openPage: vi.fn(), refreshTree: vi.fn(), openTrash: vi.fn(), ...workspace };
  render(<NotebookWorkspaceContext.Provider value={value}><NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={9} panels={{ history: <p>Versions panel</p> }} /></NotebookWorkspaceContext.Provider>);
  fireEvent.click(screen.getByRole('tab', { name: 'History' }));
  return value;
}
const openMenu = (name: string) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });

describe('History ribbon', () => {
  it('keeps page versions and opens the notebook recycle bin', () => {
    const ws = mount();
    expect(screen.getByText('Versions panel')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Notebook recycle bin' }));
    expect(ws.openTrash).toHaveBeenCalled();
  });

  it('marks the page read or unread, and a whole section or notebook read', async () => {
    vi.mocked(apiJson).mockResolvedValue({ ok: true } as any);
    const ws = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(ws.refreshTree).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(apiJson).mock.calls[0][1]?.body))).toEqual({ pageIds: [9], read: true });
    for (const [item, body] of [['Mark page as unread', { pageIds: [9], read: false }], ['Mark section as read', { sectionId: 5, read: true }], ['Mark notebook as read', { notebookId: 1, read: true }]] as const) {
      openMenu('Mark as read options');
      fireEvent.click(await screen.findByRole('menuitem', { name: item }));
      await waitFor(() => expect(JSON.parse(String(vi.mocked(apiJson).mock.calls.at(-1)![1]?.body))).toEqual(body));
    }
  });

  it('lists recent edits and opens the chosen page', async () => {
    vi.mocked(apiJson).mockResolvedValue([{ id: 9, sectionId: 5, title: 'Drive', at: '2026-10-10T12:00:00Z', authorId: 2, authorName: 'Lee' }] as any);
    const ws = mount();
    openMenu('Recent edits');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Last 7 days' }));
    const entry = await screen.findByRole('button', { name: /Drive/ });
    expect(entry.textContent).toContain('Lee');
    expect(String(vi.mocked(apiJson).mock.calls[0][0])).toMatch(/^\/api\/notebook\/recent\?since=/);
    fireEvent.click(entry);
    expect(ws.openPage).toHaveBeenCalledWith(9);
  });

  it('finds pages by author', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string) => url === '/api/notebook/authors'
      ? [{ id: 2, name: 'Lee', pages: 1 }] as any
      : [{ id: 9, sectionId: 5, title: 'Drive', at: '2026-10-10T12:00:00Z', authorId: 2, authorName: 'Lee' }] as any);
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Find by author' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Person' }), { target: { value: '2' } });
    expect(await screen.findByRole('button', { name: /Drive/ })).toBeTruthy();
    expect(vi.mocked(apiJson).mock.calls.some(([url]) => String(url).includes('author=2'))).toBe(true);
  });
});

describe('History dialog requests', () => {
  it("a slow response after closing doesn't reopen the dialog", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(apiJson).mockImplementation(() => new Promise(r => { resolve = r; }) as any);
    mount();
    openMenu('Recent edits');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Today' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    resolve([{ id: 9, sectionId: 5, title: 'Drive', at: '2026-10-10T12:00:00Z', authorId: 2, authorName: 'Lee' }]);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
