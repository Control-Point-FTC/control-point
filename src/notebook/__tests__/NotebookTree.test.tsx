import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotebookPage } from '../NotebookPage';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
vi.mock('../NotebookEditor', () => ({ NotebookEditor: () => null, downloadNotebookJSON: vi.fn() }));
const viewport=vi.hoisted(()=>({mobile:false}));
vi.mock('../useNotebookMobile',()=>({useNotebookMobile:()=>viewport.mobile}));
let view:ReturnType<typeof render>;
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear();viewport.mobile=false; });
function mount(path = '/notebook', emptySection = false) {
  const tree = { notebooks: [{ id: 1, title: 'Robot notes', color: '#3b82f6', sort: 0 }], sections: [{ id: 1, notebookId: 1, title: 'Build', color: '#22c55e', sort: 0, protected: false }], pages: [{ id: 2, sectionId: 1, parentId: null, title: 'Drive', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' }, { id: 3, sectionId: 1, parentId: 2, title: 'Motor tests', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' }], permissions: { read: true, edit: true, organize: true, delete: true, protect: true } };
  if (emptySection) tree.sections.push({id:4,notebookId:1,title:'Empty section',color:'#111111',sort:1,protected:false});
  vi.mocked(apiJson).mockImplementation(async (path, options) => {
    if (path === '/api/notebook/tree') return structuredClone(tree) as any;
    if (path === '/api/notebook/mentions') return [] as any;
    if (path === '/api/notebook/sections/1' && options?.method === 'PATCH') { tree.sections[0].title = JSON.parse(String(options.body)).title; return {} as any; }
    throw new Error(`Unexpected request ${path}`);
  });
  view=render(<MemoryRouter initialEntries={[path]}><NotebookPage activeTeamId={20} currentUserId={10} /></MemoryRouter>);
  return tree;
}
describe('notebook hierarchy controls', () => {
  it('does not steal focus on resize after writing focus has ended',async()=>{
    mount();await screen.findByRole('button',{name:'Build'});fireEvent.click(screen.getByRole('button',{name:'Expand writing space'}));
    fireEvent.click(screen.getByRole('button',{name:'Show sections and pages'}));
    const editor=document.createElement('textarea');document.body.append(editor);editor.focus();
    try{viewport.mobile=true;view.rerender(<MemoryRouter><NotebookPage activeTeamId={20} currentUserId={10}/></MemoryRouter>);expect(document.activeElement).toBe(editor);}finally{editor.remove();}
  });
  it('moves focus to mobile notebook navigation when the focused return control disappears on resize',async()=>{
    mount();await screen.findByRole('button',{name:'Build'});fireEvent.click(screen.getByRole('button',{name:'Expand writing space'}));
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Show sections and pages'}));
    viewport.mobile=true;view.rerender(<MemoryRouter><NotebookPage activeTeamId={20} currentUserId={10}/></MemoryRouter>);
    expect(screen.queryByRole('button',{name:'Show sections and pages'})).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Open notebooks'}));
  });
  it('expands writing space by hiding notebook panes without toggling the app sidebar',async()=>{
    mount();await screen.findByRole('button',{name:'Build'});
    const appToggle=vi.fn();window.addEventListener('cp:notebook-navigation',appToggle);
    try{
      fireEvent.click(screen.getByRole('button',{name:'Expand writing space'}));
      expect(screen.queryByRole('complementary',{name:'Notebook explorer'})).toBeNull();
      expect(screen.queryByRole('complementary',{name:'Pages in selected section'})).toBeNull();
      const restore=screen.getByRole('button',{name:'Show sections and pages'});expect(document.activeElement).toBe(restore);
      expect(appToggle).not.toHaveBeenCalled();fireEvent.click(restore);
      expect(screen.getByRole('complementary',{name:'Notebook explorer'})).toBeTruthy();
      expect(screen.getByRole('complementary',{name:'Pages in selected section'})).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('button',{name:'Expand writing space'}));
    }finally{window.removeEventListener('cp:notebook-navigation',appToggle);}
  });
  it('offers an organizer recovery path only when no notebook exists',async()=>{
    vi.mocked(apiJson).mockImplementation(async path=>path==='/api/notebook/mentions'?[] as any:({notebooks:[],sections:[],pages:[],permissions:{organize:true,edit:true}} as any));
    render(<MemoryRouter><NotebookPage activeTeamId={20} currentUserId={10}/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'Set up team notebook'}));
    expect(screen.getByRole('dialog').textContent).toContain('New notebook');
  });
  it('keeps existing notebook and section creation available while new notebooks are hidden',async()=>{
    mount();expect(await screen.findByRole('button',{name:'Robot notes'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'New notebook'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'New section'}));
    expect(screen.getByRole('dialog').textContent).toContain('New section');
    expect(vi.mocked(apiJson).mock.calls.some(([path,options])=>path==='/api/notebook/notebooks'&&options?.method==='POST')).toBe(false);
  });
  it('clears a copied path selection when opening an empty section and creates pages there', async () => {
    mount('/notebook/p/2',true);
    fireEvent.click(await screen.findByRole('button', { name: 'Empty section' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Drive' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    expect((screen.getByLabelText('Section') as HTMLSelectElement).value).toBe('4');
  });
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
