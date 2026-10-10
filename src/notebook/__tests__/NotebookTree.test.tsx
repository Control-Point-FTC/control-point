import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as Y from 'yjs';
import { encodeBytes, decodeBytes } from '../NotebookSync';
import { MemoryRouter } from 'react-router-dom';
import { NotebookPage } from '../NotebookPage';
import { rowMenuTrigger } from '../../components/contextmenu/ContextMenuProvider';
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
  const documents = new Map<number, Y.Doc>();
  vi.mocked(apiJson).mockImplementation(async (path, options) => {
    if (path === '/api/notebook/tree') return structuredClone(tree) as any;
    if (path === '/api/notebook/mentions') return [] as any;
    const match = path.match(/^\/api\/notebook\/pages\/(\d+)\/sync$/);
    if (match) {
      const id = Number(match[1]), page = tree.pages.find(p => p.id === id)!;
      let doc = documents.get(id);
      if (!doc) { doc = new Y.Doc(); doc.getMap('meta').set('title', page.title); documents.set(id, doc); }
      const body = JSON.parse(String(options?.body ?? '{}'));
      if (body.update) { Y.applyUpdate(doc, decodeBytes(body.update)); page.title = String(doc.getMap('meta').get('title')); }
      return { epoch: 'one', update: encodeBytes(Y.encodeStateAsUpdate(doc)), vector: encodeBytes(Y.encodeStateVector(doc)), title: page.title, revision: 1, protected: false, editable: true, updatedBy: 10, updatedAt: 'now', peers: [] } as any;
    }
    if (path === '/api/notebook/sections' && options?.method === 'POST') {
      const body = JSON.parse(String(options.body));
      const section = { id: 90 + tree.sections.length, notebookId: body.notebookId, title: body.title, color: null, sort: tree.sections.length, protected: false };
      tree.sections.push(section); return { id: section.id } as any;
    }
    if (path === '/api/notebook/pages' && options?.method === 'POST') {
      const body = JSON.parse(String(options.body));
      const page = { id: 900 + tree.pages.length, sectionId: body.sectionId, parentId: body.parentId ?? null, title: body.title, sort: tree.pages.length, protected: false, ownProtected: false, revision: 1, updatedAt: 'now' };
      tree.pages.push(page); return { id: page.id } as any;
    }
    if (path === '/api/notebook/sections/1' && options?.method === 'PATCH') { tree.sections[0].title = JSON.parse(String(options.body)).title; return {} as any; }
    throw new Error(`Unexpected request ${path}`);
  });
  view=render(<MemoryRouter initialEntries={[path]}><NotebookPage activeTeamId={20} currentUserId={10} /></MemoryRouter>);
  return tree;
}
describe('notebook hierarchy controls', () => {
  it('right-click on a notebook, section or page row opens that row\'s own actions', async () => {
    mount();
    for (const name of ['Robot notes', 'Build', 'Motor tests']) {
      const label = (await screen.findAllByText(name))[0];
      expect(rowMenuTrigger(label)?.getAttribute('aria-label')).toBe(`Actions for ${name}`);
    }
    // Recent and Pinned list pages without the tree around them; same menu.
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }));
    const recent = (await screen.findAllByText('Drive'))[0];
    expect(rowMenuTrigger(recent)?.getAttribute('aria-label')).toBe('Actions for Drive');
  });
  it('falls back to a surviving section after the selected empty section disappears', async () => {
    const tree = mount('/notebook', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Empty section' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Drive' })).toBeNull());
    // A refreshed tree can lose the chosen section through another member's deletion.
    tree.sections = tree.sections.filter(s => s.id !== 4);
    fireEvent.click(screen.getByRole('button', { name: 'New section' }));
    const rename = await screen.findByRole('textbox', { name: 'Rename section' });
    fireEvent.keyDown(rename, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'New page' }));
    await screen.findByRole('textbox', { name: 'Rename page' });
    const post = vi.mocked(apiJson).mock.calls.find(([p, o]) => p === '/api/notebook/pages' && o?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body)).sectionId).toBe(1);
  });
  it('keeps focus on instant naming when creation exits writing focus', async () => {
    mount(); await screen.findByRole('button', { name: 'Build' });
    fireEvent.click(screen.getByRole('button', { name: 'Expand writing space' }));
    fireEvent.click(screen.getByRole('button', { name: 'New page' }));
    const input = await screen.findByRole('textbox', { name: 'Rename page' });
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('complementary', { name: 'Pages in selected section' })).toBeTruthy();
  });
  it('creates from the header in the chosen empty section and leaves filtered views for naming', async () => {
    mount('/notebook', true); fireEvent.click(await screen.findByRole('button', { name: 'Empty section' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Drive' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }));
    fireEvent.click(screen.getByRole('button', { name: 'New page' }));
    await screen.findByRole('textbox', { name: 'Rename page' });
    const post = vi.mocked(apiJson).mock.calls.find(([p, o]) => p === '/api/notebook/pages' && o?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body)).sectionId).toBe(4);
    expect(screen.getByRole('button', { name: 'Notebooks' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('retains the mobile rename and draft after failure, then closes it after retry', async () => {
    viewport.mobile = true; mount(); await within(screen.getByRole('banner')).findByRole('button', { name: 'New page' });
    const original = vi.mocked(apiJson).getMockImplementation()!;
    let fail = true;
    vi.mocked(apiJson).mockImplementation(async (path, options) => {
      if (path.endsWith('/sync') && JSON.parse(String(options?.body ?? '{}')).update && fail) throw new Error('rename save failed');
      return original(path, options);
    });
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'New page' }));
    const input = await screen.findByRole('textbox', { name: 'Rename page' });
    fireEvent.change(input, { target: { value: 'Retry this title' } }); fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('Title has not reached the server.');
    expect(screen.getByRole('textbox', { name: 'Rename page' })).toHaveValue('Retry this title');
    fail = false; fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename page' })).toBeNull());
  });
  it('waits for the initial CRDT document before saving an instant page title', async () => {
    const tree = mount(); await screen.findByRole('button', { name: 'Build' });
    const original = vi.mocked(apiJson).getMockImplementation()!;
    let release!: () => void; const joining = new Promise<void>(resolve => { release = resolve; });
    let joined = false;
    vi.mocked(apiJson).mockImplementation(async (path, options) => {
      if (path === '/api/notebook/pages/902/sync' && !joined) { await joining; joined = true; }
      return original(path, options);
    });
    fireEvent.click(screen.getByRole('button', { name: 'New page' }));
    const input = await screen.findByRole('textbox', { name: 'Rename page' });
    fireEvent.change(input, { target: { value: 'Named before join' } }); fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.some(([p]) => p === '/api/notebook/pages/902/sync')).toBe(true));
    expect(tree.pages.find(p => p.id === 902)?.title).toBe('Untitled');
    await act(async () => { release(); });
    await waitFor(() => expect(tree.pages.find(p => p.id === 902)?.title).toBe('Named before join'));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename page' })).toBeNull());
  });
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
    vi.mocked(apiJson).mockImplementation(async (path,options)=>{
      if(path==='/api/notebook/mentions')return[] as any;
      if(path==='/api/notebook/tree')return{notebooks:[],sections:[],pages:[],permissions:{organize:true,edit:true}} as any;
      if(path==='/api/notebook/notebooks'&&options?.method==='POST')return{id:7} as any;
      throw new Error(`Unexpected request ${path}`);
    });
    render(<MemoryRouter><NotebookPage activeTeamId={20} currentUserId={10}/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'Set up team notebook'}));
    await waitFor(()=>expect(vi.mocked(apiJson).mock.calls.some(([p,o])=>p==='/api/notebook/notebooks'&&o?.method==='POST')).toBe(true));
    const call=vi.mocked(apiJson).mock.calls.find(([p,o])=>p==='/api/notebook/notebooks'&&o?.method==='POST')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({title:'Untitled'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('creates sections instantly as Untitled with inline rename and no dialog',async()=>{
    mount();await screen.findByRole('button',{name:'Robot notes'});
    expect(screen.queryByRole('button',{name:'New notebook'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'New section'}));
    await waitFor(()=>expect(vi.mocked(apiJson).mock.calls.some(([p,o])=>p==='/api/notebook/sections'&&o?.method==='POST')).toBe(true));
    const call=vi.mocked(apiJson).mock.calls.find(([p,o])=>p==='/api/notebook/sections'&&o?.method==='POST')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({title:'Untitled',notebookId:1});
    expect(vi.mocked(apiJson).mock.calls.some(([p,o])=>p==='/api/notebook/notebooks'&&o?.method==='POST')).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    const renameBox=await screen.findByRole('textbox',{name:'Rename section'});
    expect(renameBox).toHaveValue('Untitled');
  });
  it('creates pages instantly as Untitled in the opened section', async () => {
    mount('/notebook/p/2',true);
    fireEvent.click(await screen.findByRole('button', { name: 'Empty section' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Drive' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.some(([p,o])=>p==='/api/notebook/pages'&&o?.method==='POST')).toBe(true));
    const call=vi.mocked(apiJson).mock.calls.find(([p,o])=>p==='/api/notebook/pages'&&o?.method==='POST')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ title: 'Untitled', sectionId: 4, parentId: null });
    expect(screen.queryByRole('dialog')).toBeNull();
    const renameBox=await screen.findByRole('textbox',{name:'Rename page'});
    expect(renameBox).toHaveValue('Untitled');
  });
  it('applies the section default template and date stamp on instant creation', async () => {
    // mount with section defaults pre-set
    const tree = { notebooks: [{ id: 1, title: 'Robot notes', color: '#3b82f6', sort: 0 }], sections: [{ id: 1, notebookId: 1, title: 'Build', color: '#22c55e', sort: 0, protected: false, defaultTemplate: 'meeting', dateStamp: true }], pages: [], permissions: { read: true, edit: true, organize: true, delete: true, protect: true } };
    let lastBody: any = null;
    vi.mocked(apiJson).mockImplementation(async (path, options) => {
      if (path === '/api/notebook/tree') return structuredClone(tree) as any;
      if (path === '/api/notebook/mentions') return [] as any;
      if (path === '/api/notebook/pages' && options?.method === 'POST') {
        lastBody = JSON.parse(String(options.body));
        return { id: 901 } as any;
      }
      throw new Error(`Unexpected request ${path}`);
    });
    render(<MemoryRouter initialEntries={['/notebook']}><NotebookPage activeTeamId={20} currentUserId={10} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Add Page' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    await waitFor(() => expect(lastBody).toBeTruthy());
    expect(lastBody.title).toBe('Untitled');
    expect(lastBody.content.type).toBe('doc');
    expect(lastBody.content.content[0].content[0].text).toMatch(/\d{4}/); // date stamp first
    expect(JSON.stringify(lastBody.content)).toContain('Meeting details'); // then template
  });
  it('ignores a second create click while the first is still in flight', async () => {
    mount(); await screen.findByRole('button',{name:'Robot notes'});
    const btn = screen.getByRole('button',{name:'New section'});
    fireEvent.click(btn); fireEvent.click(btn);
    await screen.findByRole('textbox',{name:'Rename section'});
    const posts = vi.mocked(apiJson).mock.calls.filter(([p,o])=>p==='/api/notebook/sections'&&o?.method==='POST');
    expect(posts).toHaveLength(1);
  });
  it('keeps the reload error and skips rename when the tree reload fails after creation', async () => {
    mount(); await screen.findByRole('button',{name:'Robot notes'});
    const orig = vi.mocked(apiJson).getMockImplementation()!;
    let failTree = false;
    vi.mocked(apiJson).mockImplementation(async (path, options) => {
      if (path === '/api/notebook/tree' && failTree) throw new Error('reload boom');
      return orig(path, options);
    });
    failTree = true;
    fireEvent.click(screen.getByRole('button',{name:'New section'}));
    await waitFor(()=>expect(screen.getByText('reload boom')).toBeTruthy());
    expect(screen.queryByRole('textbox',{name:'Rename section'})).toBeNull();
    expect(vi.mocked(apiJson).mock.calls.filter(([p,o])=>p==='/api/notebook/sections'&&o?.method==='POST')).toHaveLength(1);
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
