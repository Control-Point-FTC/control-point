import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { encodeBytes } from '../NotebookSync';
import { NotebookPage } from '../NotebookPage';
import { apiJson, ApiError } from '../../services/api';
import { defaultNotebookPage, firstNotebookPage, lastPageKey } from '../autoOpen';
import type { NotebookTree } from '../types';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
vi.mock('../NotebookEditor', () => ({ NotebookEditor: () => null, downloadNotebookJSON: vi.fn() }));
vi.mock('../useNotebookMobile', () => ({ useNotebookMobile: () => false }));
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });

const page = (id: number, sectionId: number, sort: number, parentId: number | null = null) => ({ id, sectionId, parentId, title: `Page ${id}`, sort, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' });
const tree = (): NotebookTree => ({
  notebooks: [{ id: 1, title: 'Book', color: null, sort: 0 }],
  sections: [{ id: 2, notebookId: 1, title: 'Second', color: null, sort: 1, protected: false, defaultTemplate: null, dateStamp: false }, { id: 1, notebookId: 1, title: 'First', color: null, sort: 0, protected: false, defaultTemplate: null, dateStamp: false }],
  pages: [page(20, 2, 0), page(11, 1, 1), page(12, 1, 0, 11), page(10, 1, 0)],
  permissions: { read: true, edit: true, organize: true, delete: true, protect: false },
});

describe('default page', () => {
  it('is the first top-level page of the first section in notebook order', () => {
    expect(firstNotebookPage(tree())).toBe(10);
    expect(firstNotebookPage({ ...tree(), pages: [] })).toBeNull();
  });
  it('prefers the last page this person opened when it still exists', () => {
    expect(defaultNotebookPage(tree(), 20)).toBe(20);
    expect(defaultNotebookPage(tree(), 999)).toBe(10);
  });
});

let location = '';
function Where() { const l = useLocation(); location = `${l.pathname}${l.search}`; return null; }
function mount(path: string, data = tree(), missing: number[] = []) {
  vi.mocked(apiJson).mockImplementation(async (url: string) => {
    if (url === '/api/notebook/tree') return structuredClone(data) as any;
    if (url === '/api/notebook/mentions') return [] as any;
    const direct = url.match(/^\/api\/notebook\/pages\/(\d+)$/);
    if (direct && missing.includes(Number(direct[1]))) throw new ApiError(404, 'Notebook item unavailable', {});
    if (/\/sync$/.test(url)) { const d = new Y.Doc(); return { epoch: 'e', update: encodeBytes(Y.encodeStateAsUpdate(d)), vector: encodeBytes(Y.encodeStateVector(d)), title: 'x', revision: 1, protected: false, editable: true, updatedBy: 1, updatedAt: 'now', peers: [] } as any; }
    return [] as any;
  });
  return render(<MemoryRouter initialEntries={[path]}><NotebookPage activeTeamId={7} currentUserId={3} /><Where /></MemoryRouter>);
}

describe('opening the notebook', () => {
  it('lands on the first page, with the ribbon visible while it opens', async () => {
    mount('/notebook');
    expect(screen.getByRole('tablist', { name: 'Notebook commands' })).toBeTruthy();
    await waitFor(() => expect(location).toBe('/notebook?page=10'));
  });
  it('reopens the last page used in this workspace', async () => {
    localStorage.setItem(lastPageKey(3, 7), '20');
    mount('/notebook');
    await waitFor(() => expect(location).toBe('/notebook?page=20'));
  });
  it('an unavailable page link opens the default page with a note, not a dead end', async () => {
    mount('/notebook?page=55', tree(), [55]);
    await waitFor(() => expect(location).toBe('/notebook?page=10'));
    expect(await screen.findByText(/isn't available in this workspace/)).toBeTruthy();
  });
  it('an empty notebook keeps the ribbon and offers a new page', async () => {
    mount('/notebook', { ...tree(), pages: [] });
    expect(await screen.findByText(/Open a page to use these commands/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'New page' }).length).toBeGreaterThan(0);
  });
});
