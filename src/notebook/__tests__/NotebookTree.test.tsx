import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotebookPage } from '../NotebookPage';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
vi.mock('../NotebookEditor', () => ({ NotebookEditor: () => null, downloadNotebookJSON: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });
function mount() {
  const tree = { notebooks: [{ id: 1, title: 'Robot notes', color: '#3b82f6', sort: 0 }], sections: [{ id: 1, notebookId: 1, title: 'Build', color: '#22c55e', sort: 0, protected: false }], pages: [{ id: 2, sectionId: 1, parentId: null, title: 'Drive', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' }, { id: 3, sectionId: 1, parentId: 2, title: 'Motor tests', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' }], permissions: { read: true, edit: true, organize: true, delete: true, protect: true } };
  vi.mocked(apiJson).mockImplementation(async (path, options) => {
    if (path === '/api/notebook/tree') return structuredClone(tree) as any;
    if (path === '/api/notebook/mentions') return [] as any;
    if (path === '/api/notebook/sections/1' && options?.method === 'PATCH') { tree.sections[0].title = JSON.parse(String(options.body)).title; return {} as any; }
    throw new Error(`Unexpected request ${path}`);
  });
  render(<MemoryRouter><NotebookPage activeTeamId={20} currentUserId={10} /></MemoryRouter>);
  return tree;
}
describe('notebook hierarchy controls', () => {
  it('remembers independent collapse keys even when a book and section share an ID', async () => {
    mount(); const section = await screen.findByRole('button', { name: 'Build' });
    fireEvent.keyDown(section, { key: 'ArrowLeft' });
    expect(JSON.parse(localStorage.getItem('cp-notebook-open:10:20')!)).toEqual(['section:1']);
    fireEvent.click(screen.getByRole('button', { name: 'Robot notes' }));
    expect(JSON.parse(localStorage.getItem('cp-notebook-open:10:20')!)).toEqual(['section:1', 'notebook:1']);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByRole('button', { name: 'Motor tests' })).toBeTruthy();
  });
  it('renames inline with F2 and Enter without clearing the section color', async () => {
    const tree = mount(), section = await screen.findByRole('button', { name: 'Build' });
    fireEvent.keyDown(section, { key: 'F2' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename section' }), { target: { value: 'Build log' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename section' }), { key: 'Enter' });
    await screen.findByRole('button', { name: 'Build log' }); expect(tree.sections[0].color).toBe('#22c55e');
    const call = vi.mocked(apiJson).mock.calls.find(([path, options]) => path === '/api/notebook/sections/1' && options?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ title: 'Build log' });
    expect(new Headers(call[1]?.headers).get('X-CP-Notebook-Team')).toBe('20');
  });
  it('cancels inline rename with Escape and persists nested-page collapse', async () => {
    mount(); const section = await screen.findByRole('button', { name: 'Build' });
    fireEvent.keyDown(section, { key: 'F2' }); fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename section' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Rename section' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Drive' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Motor tests' })).toBeNull());
    expect(JSON.parse(localStorage.getItem('cp-notebook-open:10:20')!)).toEqual(['page:2']);
    expect(vi.mocked(apiJson).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });
});
