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
    // The server trashes the source only when nothing hidden is left in it.
    if (url === '/api/notebook/sections/1/merge') return (admin ? { moved: 1, trashed: true } : { moved: 1, trashed: false, kept: 'has_pages' }) as any;
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
    // Only the color: a teammate's rename since the tree loaded must survive.
    await waitFor(() => expect(calls('PATCH')).toContainEqual(['/api/notebook/sections/1', { color: '#8b5cf6' }]));
  });

  it('merges a section into another with one server call', async () => {
    mount();
    await openMenu('Build');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into another section…' }));
    expect(await screen.findByLabelText('Merge into')).toHaveValue('4');
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(calls('POST')).toContainEqual(['/api/notebook/sections/1/merge', { into: 4 }]));
    expect(calls('POST').some(([u]) => u === '/api/notebook/move')).toBe(false);
    expect(calls('DELETE')).toEqual([]);
    expect(await screen.findByText('Merged 1 page into Outreach.')).toBeInTheDocument();
  });

  it('says when the server kept the source because pages the member cannot see are left', async () => {
    mount('/notebook', false);
    await openMenu('Build');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into another section…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));
    expect(await screen.findByText(/“Build” was kept because it still has pages you can’t see\./)).toBeInTheDocument();
  });

  it('opens a section from its link, and ignores sections the member cannot see', async () => {
    mount('/notebook?section=4');
    await waitFor(() => expect(location).toBe('?page=5'));
    cleanup(); localStorage.clear();
    mount('/notebook?section=99');
    await waitFor(() => expect(location).toBe('?page=2'));
  });
});
