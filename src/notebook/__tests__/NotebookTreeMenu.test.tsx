import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotebookPage } from '../NotebookPage';
import { apiJson } from '../../services/api';
import * as Y from 'yjs';
import { encodeBytes } from '../NotebookSync';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
vi.mock('../NotebookEditor', () => ({ NotebookEditor: () => null, downloadNotebookJSON: vi.fn() }));
vi.mock('../useNotebookMobile', () => ({ useNotebookMobile: () => false }));
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });

let location = '';
function Where() { location = useLocation().search; return null; }
function mount(path = '/notebook', admin = true) {
  const tree = {
    notebooks: [{ id: 1, title: 'Robot notes', color: '#3b82f6', sort: 0 }],
    sections: [{ id: 1, notebookId: 1, title: 'Build', color: '#22c55e', sort: 0, protected: false }, { id: 4, notebookId: 1, title: 'Outreach', color: null, sort: 1, protected: false }],
    pages: [
      { id: 2, sectionId: 1, parentId: null, title: 'Drive', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' },
      { id: 3, sectionId: 1, parentId: 2, title: 'Motor tests', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' },
      { id: 5, sectionId: 4, parentId: null, title: 'Flyers', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' },
    ],
    permissions: { read: true, edit: true, organize: true, delete: true, protect: admin },
  };
  vi.mocked(apiJson).mockImplementation(async (url: string) => {
    if (url === '/api/notebook/tree') return structuredClone(tree) as any;
    if (url === '/api/notebook/mentions') return [] as any;
    if (/^\/api\/notebook\/pages\/\d+\/sync$/.test(url)) { const doc = new Y.Doc(); return { epoch: 'one', update: encodeBytes(Y.encodeStateAsUpdate(doc)), vector: encodeBytes(Y.encodeStateVector(doc)), title: 'Page', revision: 1, protected: false, editable: true, updatedBy: 10, updatedAt: 'now', peers: [] } as any; }
    return {} as any;
  });
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><NotebookPage activeTeamId={20} currentUserId={10} /><Where /></>} /></Routes></MemoryRouter>);
  return tree;
}
const openMenu = async (name: string) => { fireEvent.keyDown(await screen.findByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' }); return screen.findByRole('menu'); };
const calls = (method: string) => vi.mocked(apiJson).mock.calls.filter(([, init]) => (init as any)?.method === method).map(([url, init]) => [url, JSON.parse(String((init as any).body ?? '{}'))]);

describe('notebook tree menus', () => {
  it('gives every item an icon and offers OneNote-style section actions', async () => {
    mount();
    const menu = await openMenu('Build');
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    expect(items.map(i => i.textContent)).toEqual(expect.arrayContaining(['Rename', 'Export (print or PDF)…', 'Move to trash', 'Move…', 'Merge into another section…', 'Copy link to section', 'New section', 'Add page', 'Section color', 'Move up', 'Move down']));
    for (const item of items) expect(item.querySelector('svg')).not.toBeNull();
  });

  it('gives page menu items icons too', async () => {
    mount();
    const menu = await openMenu('Drive');
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) expect(item.querySelector('svg')).not.toBeNull();
  });

  it('recolors a section from the color submenu', async () => {
    mount();
    await openMenu('Build');
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Section color' }), { key: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Purple/ }));
    await waitFor(() => expect(calls('PATCH')).toContainEqual(['/api/notebook/sections/1', { title: 'Build', color: '#8b5cf6' }]));
  });

  it('merges a section into another and trashes the empty section for admins', async () => {
    mount();
    await openMenu('Build');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into another section…' }));
    expect(await screen.findByLabelText('Merge into')).toHaveValue('4');
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    // Only the top-level page moves; its subpage goes with it.
    await waitFor(() => expect(calls('DELETE').map(([u]) => u)).toEqual(['/api/notebook/sections/1']));
    expect(calls('POST').filter(([u]) => u === '/api/notebook/move')).toEqual([['/api/notebook/move', { kind: 'page', id: 2, to: { sectionId: 4, parentId: null }, index: 'end' }]]);
  });

  it('keeps the emptied section for non-admins, who may not see protected pages in it', async () => {
    mount('/notebook', false);
    await openMenu('Build');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into another section…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(calls('POST').some(([u]) => u === '/api/notebook/move')).toBe(true));
    expect(await screen.findByText(/The empty section is still there/)).toBeInTheDocument();
    expect(calls('DELETE')).toEqual([]);
  });

  it('opens a section from its link, and ignores sections the member cannot see', async () => {
    mount('/notebook?section=4');
    await waitFor(() => expect(location).toBe('?page=5'));
    cleanup(); localStorage.clear();
    mount('/notebook?section=99');
    await waitFor(() => expect(location).toBe('?page=2'));
  });
});
