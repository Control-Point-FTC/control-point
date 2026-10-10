import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as Y from 'yjs';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap';
import { notebookSchema } from '../editorSchema';
import { NotebookSync, decodeBytes, encodeBytes } from '../NotebookSync';
import { NotebookEditor } from '../NotebookEditor';
import { apiJson, ApiError } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const uploadState=vi.hoisted(()=>({busy:false}));
vi.mock('../NotebookAttachments',async importOriginal=>{
  const actual=await importOriginal<any>();
  return {...actual,useNotebookUpload:(...args:any[])=>({...actual.useNotebookUpload(...args),busy:uploadState.busy})};
});
const providers: NotebookSync[] = [], docs: Y.Doc[] = [];
afterEach(() => { cleanup(); uploadState.busy=false; providers.splice(0).forEach(p => p.destroy()); docs.splice(0).forEach(d => d.destroy()); vi.resetAllMocks(); });
async function mount(editable = true) {
  const server = prosemirrorJSONToYDoc(notebookSchema, { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'discovery-block' }, content: [{ type: 'text', text: 'Team discoveries' }] }] });
  server.getMap('meta').set('title', 'Journal'); docs.push(server);
  vi.mocked(apiJson).mockImplementation(async (url, init) => {
    if (url.endsWith('/backlinks')) return [] as any;
    if (url.endsWith('/threads')) return { items: [], next: null, canComment: editable } as any;
    if (url.endsWith('/mention-members')) return [] as any;
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.update) Y.applyUpdate(server, decodeBytes(body.update));
    return { epoch: 'one', update: encodeBytes(Y.encodeStateAsUpdate(server, body.vector ? decodeBytes(body.vector) : undefined)), vector: encodeBytes(Y.encodeStateVector(server)), title: server.getMap('meta').get('title'), revision: 1, protected: false, editable, updatedBy: 1, updatedAt: 'now', peers: [{ clientId: body.clientId, memberId: 1, name: 'Teammate', color: '#3b82f6', cursor: null, clock: Date.now() }] } as any;
  });
  const sync = new NotebookSync(1); providers.push(sync); await sync.start();
  const navigate = vi.fn();
  const view=render(<MemoryRouter><NotebookEditor sync={sync} onChanged={() => {}} pages={[]} onNavigate={navigate} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Page content' }).textContent).toContain('Team discoveries'));
  return { sync, server, navigate,view };
}
describe('mounted collaborative notebook editor', () => {
  it('explains an uncached offline page even when the sync also has a network error',async()=>{
    vi.mocked(apiJson).mockRejectedValue(new TypeError('Failed to fetch'));
    const sync=new NotebookSync(42);providers.push(sync);await sync.start();
    render(<MemoryRouter><NotebookEditor sync={sync} onChanged={()=>{}} pages={[]} onNavigate={()=>{}}/></MemoryRouter>);
    expect(screen.getByText('This page is not cached on this device. Reconnect to open it.')).toBeTruthy();expect(screen.getByText('Failed to fetch')).toBeTruthy();
  });
  it('keeps reading preferences when the View ribbon unmounts even without device storage',async()=>{
    await mount();const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
    try{
      fireEvent.click(screen.getByRole('tab',{name:'View'}));fireEvent.click(screen.getByRole('button',{name:'Reading mode'}));
      fireEvent.change(screen.getByLabelText('Reader text size'),{target:{value:'28'}});fireEvent.change(screen.getByLabelText('Reader background'),{target:{value:'dark'}});
      fireEvent.click(screen.getByRole('button',{name:'Return to page'}));fireEvent.click(screen.getByRole('tab',{name:'Home'}));fireEvent.click(screen.getByRole('tab',{name:'View'}));fireEvent.click(screen.getByRole('button',{name:'Reading mode'}));
      expect(screen.getByLabelText('Reader text size')).toHaveValue('28');expect(screen.getByRole('dialog')).toHaveClass('nb-reader-dark');
      expect(screen.getByRole('heading',{name:'Journal'}).style.color).toBe('inherit');
    }finally{storage.mockRestore();}
  });
  it('keeps two real editors and titles independent while ribbon ownership changes',async()=>{
    const {sync,server,view}=await mount();
    const secondary=prosemirrorJSONToYDoc(notebookSchema,{type:'doc',content:[{type:'paragraph',attrs:{id:'secondary-block'},content:[{type:'text',text:'Linked experiment',marks:[{type:'link',attrs:{href:'/notebook/p/3?block=target'}}]}]}]});secondary.getMap('meta').set('title','Other journal');docs.push(secondary);
    const original=vi.mocked(apiJson).getMockImplementation()!;
    vi.mocked(apiJson).mockImplementation(async(url,options)=>{
      if(!url.includes('/pages/2/sync'))return original(url,options);
      const body=JSON.parse(String(options?.body??'{}'));if(body.update)Y.applyUpdate(secondary,decodeBytes(body.update));
      return {...sync.data,epoch:'two',update:encodeBytes(Y.encodeStateAsUpdate(secondary,body.vector?decodeBytes(body.vector):undefined)),vector:encodeBytes(Y.encodeStateVector(secondary)),title:secondary.getMap('meta').get('title'),editable:true,protected:false,peers:[]} as any;
    });
    const other=new NotebookSync(2);providers.push(other);await other.start();const openOther=vi.fn(),navigate=vi.fn();
    const panes=(active:'main'|'other')=><MemoryRouter><section aria-label="Main pane"><NotebookEditor sync={sync} onChanged={()=>{}} pages={[]} onNavigate={navigate} toolbarVisible={active==='main'}/></section><section aria-label="Other pane"><NotebookEditor sync={other} onChanged={()=>{}} pages={[]} onNavigate={navigate} toolbarVisible={active==='other'} blockTarget={null} threadTarget={null} onOpenOther={openOther}/></section></MemoryRouter>;
    view.rerender(panes('other'));await screen.findByText('Linked experiment');
    const main=document.querySelector('section[aria-label="Main pane"]')!,pane=document.querySelector('section[aria-label="Other pane"]')!;
    const first=main.querySelector('[aria-label="Page content"]')!,second=pane.querySelector('[aria-label="Page content"]')!;
    fireEvent.change(pane.querySelector('[aria-label="Page title"]')!,{target:{value:'Changed independently'}});
    expect(sync.doc.getMap('meta').get('title')).toBe('Journal');expect(other.doc.getMap('meta').get('title')).toBe('Changed independently');
    fireEvent.click(pane.querySelector('a')!,{altKey:true});expect(openOther).toHaveBeenCalledWith(3,'target');expect(navigate).not.toHaveBeenCalled();
    const otherEditor=(second as HTMLElement&{editor:import('@tiptap/react').Editor}).editor;
    act(()=>{otherEditor.commands.setTextSelection({from:1,to:7});});fireEvent.click(screen.getByRole('button',{name:'Bold'}));
    expect(JSON.stringify(yDocToProsemirrorJSON(other.doc))).toContain('"type":"bold"');expect(JSON.stringify(yDocToProsemirrorJSON(sync.doc))).not.toContain('"type":"bold"');
    expect(screen.getAllByRole('tab',{name:'Home'})).toHaveLength(1);view.rerender(panes('main'));
    expect(main.querySelector('[aria-label="Page content"]')).toBe(first);expect(pane.querySelector('[aria-label="Page content"]')).toBe(second);expect(screen.getAllByRole('tab',{name:'Home'})).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Format painter'}));expect(screen.getByRole('button',{name:'Format painter'})).toHaveAttribute('aria-pressed','true');view.rerender(panes('other'));view.rerender(panes('main'));expect(screen.getByRole('button',{name:'Format painter'})).toHaveAttribute('aria-pressed','true');
    fireEvent.keyDown(first,{key:'f',ctrlKey:true});expect(screen.getAllByRole('search',{name:'Find in page',hidden:true})).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab',{name:'View'}));fireEvent.change(within(main as HTMLElement).getByLabelText('Paper pattern'),{target:{value:'ruled'}});fireEvent.click(screen.getByRole('button',{name:'Hide page title'}));
    const mainPaper=main.querySelector<HTMLElement>('.nb-paper')!,otherPaper=pane.querySelector<HTMLElement>('.nb-paper')!;
    expect(mainPaper.style.backgroundImage).toContain('repeating-linear-gradient');expect(otherPaper.style.backgroundImage).toBe('none');expect((main.querySelector('[aria-label="Page title"]') as HTMLInputElement).hidden).toBe(true);
    view.rerender(panes('other'));fireEvent.click(screen.getByRole('tab',{name:'View'}));fireEvent.change(within(pane as HTMLElement).getByLabelText('Paper pattern'),{target:{value:'grid'}});fireEvent.click(screen.getByRole('button',{name:'Hide page title'}));
    expect(otherPaper.style.backgroundImage).toContain('to right');expect(mainPaper.style.backgroundImage).toContain('repeating-linear-gradient');
    view.rerender(panes('main'));fireEvent.click(screen.getByRole('button',{name:'Reset page appearance'}));expect(mainPaper.style.backgroundImage).toBe('none');expect((main.querySelector('[aria-label="Page title"]') as HTMLInputElement).hidden).toBe(false);
    expect(otherPaper.style.backgroundImage).toContain('to right');expect((pane.querySelector('[aria-label="Page title"]') as HTMLInputElement).hidden).toBe(true);
    await act(async()=>{await other.flush();});expect(server.getMap('meta').get('title')).toBe('Journal');expect(secondary.getMap('meta').get('title')).toBe('Changed independently');
  });
  it('makes text, title and insertion controls read only while a revision restore is pending',async()=>{
    const {sync}=await mount();
    act(()=>sync.setRestoring(true));
    expect(screen.getByRole('textbox',{name:'Page title'})).toBeDisabled();
    expect(screen.getByRole('textbox',{name:'Page content'}).getAttribute('contenteditable')).toBe('false');
    fireEvent.click(screen.getByRole('tab',{name:'Insert'}));expect(screen.getByRole('button',{name:/^Table$/})).toBeDisabled();
    act(()=>sync.setRestoring(false));expect(screen.getByRole('textbox',{name:'Page title'})).not.toBeDisabled();
    expect(screen.getByRole('textbox',{name:'Page content'}).getAttribute('contenteditable')).toBe('true');
  });
  it('does not claim a pending upload is saved or print an incomplete snapshot',async()=>{
    uploadState.busy=true;await mount();
    expect(screen.getByText('Uploading attachment · not saved yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab',{name:'File'}));
    const calls=vi.mocked(apiJson).mock.calls.length;
    fireEvent.click(screen.getByRole('button',{name:'Print page'}));
    expect(screen.getByText('Wait for the attachment upload to finish before printing.')).toBeTruthy();
    expect(vi.mocked(apiJson).mock.calls).toHaveLength(calls);
  });
  it('mounts the real CRDT editor, toolbar and carets, and saves shared titles', async () => {
    const { sync, server } = await mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
    expect(screen.getByRole('toolbar', { name: 'Home commands' })).toBeTruthy();
    expect(screen.getByLabelText('People on this page').textContent).toContain('Teammate');
    fireEvent.change(screen.getByRole('textbox', { name: 'Page title' }), { target: { value: 'Shared journal' } });
    await act(async () => { expect(await sync.flush()).toBe(true); });
    expect(server.getMap('meta').get('title')).toBe('Shared journal');
    expect(yDocToProsemirrorJSON(server).content[0].content[0].text).toBe('Team discoveries');
  });
  it('keeps readers unable to edit while rendering saved advanced content', async () => {
    await mount(false);
    expect(screen.getByRole('textbox', { name: 'Page title' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Page content' }).getAttribute('contenteditable')).toBe('false');
    fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
    expect(screen.getByRole('button', { name: /^Table$/ }).hasAttribute('disabled')).toBe(true);
    expect(providers[0].pending).toBe(false);
  });
  it('removes the editor and its title when protected-page access is revoked', async () => {
    const { sync } = await mount();
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(404, 'Unavailable'));
    await act(async () => { await sync.flush(); });
    expect(screen.queryByRole('textbox', { name: 'Page content' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Page title' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('cannot be opened');
  });
  it('changes desktop viewing controls without changing the saved document', async () => {
    const { sync, server } = await mount(); const before = yDocToProsemirrorJSON(server);
    fireEvent.click(screen.getByRole('tab', { name: 'View' }));
    fireEvent.change(screen.getByLabelText('Page zoom percentage'), { target: { value: '150' } });
    fireEvent.keyDown(screen.getByLabelText('Page zoom percentage'), {key:'Enter'});
    expect(document.querySelector<HTMLElement>('.nb-paper')!.style.zoom).toBe('1.5');
    const paper=document.querySelector<HTMLElement>('.nb-paper')!,scroll=paper.parentElement!;
    Object.defineProperty(paper,'scrollWidth',{value:1400,configurable:true});Object.defineProperty(scroll,'clientWidth',{value:700,configurable:true});
    fireEvent.click(screen.getByRole('button',{name:'Fit width'}));expect(paper.style.zoom).toBe('0.5');
    fireEvent.click(screen.getByRole('button',{name:'Reset to 100%'}));expect(paper.style.zoom).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Rule lines' }));
    expect(document.querySelector('.nb-paper.nb-ruled')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Paper pattern'),{target:{value:'grid'}});fireEvent.change(screen.getByLabelText('Paper line spacing'),{target:{value:'40'}});expect(paper.style.backgroundSize).toBe('40px 40px');
    fireEvent.click(screen.getByRole('button',{name:'Hide page title'}));expect(screen.queryByRole('textbox',{name:'Page title'})).toBeNull();expect(sync.doc.getMap('meta').get('title')).toBe('Journal');
    fireEvent.click(screen.getByRole('button',{name:'Show page title'}));expect(screen.getByRole('textbox',{name:'Page title'})).toHaveValue('Journal');
    await act(async () => { await sync.flush(); });
    expect(yDocToProsemirrorJSON(server)).toEqual(before);
  });
  it('loads history only when requested and renders saved revision dates', async () => {
    await mount(); const original = vi.mocked(apiJson).getMockImplementation()!;
    vi.mocked(apiJson).mockImplementation(async (url, options) => url.endsWith('/versions') ? [{ id: 3, revision: 2, authorId: 1, savedAt: '2026-10-08T18:00:00Z' }] as any : original(url, options));
    expect(vi.mocked(apiJson).mock.calls.some(([url]) => url.endsWith('/versions'))).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByRole('option',{name:'Revision 2 · Team member'})).toBeTruthy();
    expect(document.querySelector('time[datetime="2026-10-08T18:00:00Z"]')).toBeTruthy();
  });
});
