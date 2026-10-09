import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NotebookHistory} from '../NotebookHistory';
import {apiJson} from '../../services/api';
import {confirmDialog} from '../../components/dialog';
vi.mock('../../services/api',()=>({apiJson:vi.fn()}));
vi.mock('../../components/dialog',()=>({confirmDialog:vi.fn()}));
const doc=(text:string)=>({type:'doc',content:[{type:'paragraph',attrs:{id:'stable'},content:[{type:'text',text}]}]});
const old={id:8,revision:2,title:'Old title',content:doc('Old ratio'),canvas:{},authorName:'Ana',savedAt:'2026-10-08T12:00:00Z'};
function mount(editable=true){
  const sync:any={pageId:4,scope:{teamId:9},data:{editable},pending:false,flush:vi.fn().mockResolvedValue(true)};
  const rejoin=vi.fn();
  vi.mocked(apiJson).mockImplementation(async url=>url.endsWith('/versions')?[old]:url.endsWith('/versions/8')?old:{revision:7,title:'Current title',content:doc('New ratio'),canvas:{}} as any);
  render(<NotebookHistory sync={sync} onRejoin={rejoin}/>);return {sync,rejoin};
}
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('revision viewer and restore',()=>{
  it('loads scoped read-only snapshots only on explicit preview and compares saved content',async()=>{
    mount();await screen.findByRole('option',{name:'Revision 2 · Ana'});
    expect(vi.mocked(apiJson).mock.calls).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Compare revisions'}));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('region',{name:'Earlier'}).textContent).toContain('Old ratio');
    expect(screen.getByRole('region',{name:'Later'}).textContent).toContain('New ratio');
    expect(document.querySelector('del')!.textContent).toBe('Old');
    expect([...document.querySelectorAll('ins')].some(node=>node.textContent==='New')).toBe(true);
    for(const [,init] of vi.mocked(apiJson).mock.calls)expect(init?.headers).toEqual({'X-CP-Notebook-Team':'9'});
  });
  it('requires confirmation and the freshly read revision before restore, then rejoins',async()=>{
    const {sync,rejoin}=mount();sync.pending=true;vi.mocked(confirmDialog).mockResolvedValue(true);
    await screen.findByRole('option',{name:'Revision 2 · Ana'});fireEvent.click(screen.getByRole('button',{name:'Restore revision'}));
    await waitFor(()=>expect(rejoin).toHaveBeenCalledOnce());expect(sync.flush).toHaveBeenCalledOnce();
    expect(confirmDialog).toHaveBeenCalledOnce();
    expect(vi.mocked(apiJson).mock.calls.find(([url])=>url.endsWith('/restore'))?.[1]).toMatchObject({method:'POST',body:JSON.stringify({baseRevision:7})});
  });
  it('keeps cancelled restores and read-only users from making writes',async()=>{
    mount();vi.mocked(confirmDialog).mockResolvedValue(false);await screen.findByRole('option',{name:'Revision 2 · Ana'});
    fireEvent.click(screen.getByRole('button',{name:'Restore revision'}));await waitFor(()=>expect(confirmDialog).toHaveBeenCalledOnce());
    expect(vi.mocked(apiJson).mock.calls.some(([url])=>url.endsWith('/restore'))).toBe(false);
    cleanup();mount(false);await screen.findByRole('option',{name:'Revision 2 · Ana'});
    expect(screen.queryByRole('button',{name:'Restore revision'})).toBeNull();
  });
  it('does not render a denied snapshot or rejoin after a restore conflict',async()=>{
    const {rejoin}=mount();await screen.findByRole('option',{name:'Revision 2 · Ana'});
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('Page unavailable'));
    fireEvent.click(screen.getByRole('button',{name:'Preview revision'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Page unavailable');expect(screen.queryByRole('dialog')).toBeNull();
    vi.mocked(confirmDialog).mockResolvedValue(true);vi.mocked(apiJson).mockImplementation(async url=>{if(url.endsWith('/restore'))throw new Error('Page changed; review the latest revision');return {revision:9} as any;});
    fireEvent.click(screen.getByRole('button',{name:'Restore revision'}));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Page changed'));expect(rejoin).not.toHaveBeenCalled();
  });
});
