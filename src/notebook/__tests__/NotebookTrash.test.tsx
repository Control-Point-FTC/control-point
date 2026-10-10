import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NotebookTrash} from '../NotebookTrash';
import {ApiError,apiJson} from '../../services/api';
import {confirmDialog} from '../../components/dialog';
import type {NotebookTree} from '../types';
vi.mock('../../services/api',async importOriginal=>({...await importOriginal<typeof import('../../services/api')>(),apiJson:vi.fn()}));
vi.mock('../../components/dialog',()=>({confirmDialog:vi.fn()}));
const item={id:4,kind:'page',title:'Build notes',deletedAt:'2026-10-09T12:00:00Z',deletedBy:'Ana'};
const listing={items:[item],nextCursor:null,retention:'Automatic expiration is disabled.'};
const tree:NotebookTree={notebooks:[{id:1,title:'Team notebook',sort:0,color:null}],sections:[{id:2,notebookId:1,title:'Build',sort:0,color:null,protected:false}],pages:[],permissions:{read:true,edit:true,organize:true,delete:true,protect:true}};
function mount(organize=true){const onRestored=vi.fn();const result=render(<NotebookTrash teamId={9} tree={{...tree,permissions:{...tree.permissions,organize}}} onRestored={onRestored}/>);return {...result,onRestored};}
async function open(){fireEvent.click(screen.getByRole('button',{name:'Trash'}));await screen.findByText('Build notes');}
beforeEach(()=>{vi.mocked(apiJson).mockResolvedValue(listing);vi.mocked(confirmDialog).mockResolvedValue(true);});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('desktop notebook trash controls',()=>{
  it('clears protected snapshots when admin access changes and reads the permitted listing again',async()=>{
    const {rerender,onRestored}=mount();await open();
    vi.mocked(apiJson).mockResolvedValueOnce({id:4,title:'Build notes',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Retained secret'}]}]},canvas:{}});
    fireEvent.click(screen.getByRole('button',{name:'Preview deleted page Build notes'}));await screen.findByText('Retained secret');
    vi.mocked(apiJson).mockResolvedValueOnce({...listing,items:[]});
    rerender(<NotebookTrash teamId={9} tree={{...tree,permissions:{...tree.permissions,protect:false}}} onRestored={onRestored}/>);
    await screen.findByText('Trash is empty');expect(screen.queryByText('Retained secret')).toBeNull();expect(apiJson).toHaveBeenCalledTimes(3);
  });
  it('aborts pending previews on permission loss and does not revive them when access returns',async()=>{
    const {rerender,onRestored}=mount();await open();let finish!:(value:any)=>void;
    vi.mocked(apiJson).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole('button',{name:'Preview deleted page Build notes'}));
    await waitFor(()=>expect(apiJson).toHaveBeenCalledTimes(2));const signal=vi.mocked(apiJson).mock.calls[1][1]?.signal;
    rerender(<NotebookTrash teamId={9} tree={{...tree,permissions:{...tree.permissions,delete:false}}} onRestored={onRestored}/>);
    expect(signal?.aborted).toBe(true);finish({title:'Lost access',content:{type:'doc',content:[]},canvas:{}});await Promise.resolve();
    rerender(<NotebookTrash teamId={9} tree={tree} onRestored={onRestored}/>);expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('Lost access')).toBeNull();
    await open();expect(screen.queryByRole('region',{name:'Retained page preview'})).toBeNull();
  });
  it('reads retained text only on explicit preview and keeps the snapshot read only',async()=>{
    mount();await open();expect(apiJson).toHaveBeenCalledOnce();
    vi.mocked(apiJson).mockResolvedValueOnce({id:4,title:'Build notes',content:{type:'doc',content:[{type:'paragraph',attrs:{id:'retained'},content:[{type:'text',text:'Original gearing measurements'}]}]},canvas:{}});
    fireEvent.click(screen.getByRole('button',{name:'Preview deleted page Build notes'}));
    const preview=await screen.findByRole('region',{name:'Retained page preview'});expect(preview).toHaveTextContent('Original gearing measurements');expect(preview.querySelector('[contenteditable="true"]')).toBeNull();
    expect(apiJson).toHaveBeenCalledTimes(2);expect(apiJson).toHaveBeenLastCalledWith('/api/notebook/trash/pages/4',expect.objectContaining({headers:{'X-CP-Notebook-Team':'9'},cache:'no-store'}));
    fireEvent.click(screen.getByRole('button',{name:'Close preview'}));expect(screen.queryByRole('region',{name:'Retained page preview'})).toBeNull();
  });
  it('clears a retained snapshot and prior titles when preview authorization is denied',async()=>{
    mount();await open();vi.mocked(apiJson).mockResolvedValueOnce({id:4,title:'Build notes',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Retained secret'}]}]},canvas:{}});
    fireEvent.click(screen.getByRole('button',{name:'Preview deleted page Build notes'}));await screen.findByRole('region',{name:'Retained page preview'});
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(404,'Deleted page unavailable'));fireEvent.click(screen.getByRole('button',{name:'Preview deleted page Build notes'}));
    await screen.findByRole('alert');expect(screen.queryByText('Build notes')).toBeNull();expect(screen.queryByText('Retained secret')).toBeNull();
  });
  it('loads only on explicit open and paginates older entries under current team scope',async()=>{
    mount();expect(apiJson).not.toHaveBeenCalled();vi.mocked(apiJson).mockResolvedValueOnce({...listing,nextCursor:'continuation'});await open();
    expect(screen.getByText('page · Deleted by Ana')).toBeTruthy();
    vi.mocked(apiJson).mockResolvedValueOnce({...listing,items:[{...item,id:5,title:'Older notes'}]});fireEvent.click(screen.getByRole('button',{name:'Load older items'}));await screen.findByText('Older notes');
    expect(screen.getByText('Build notes')).toBeTruthy();expect(apiJson).toHaveBeenLastCalledWith('/api/notebook/trash?cursor=continuation',expect.objectContaining({headers:{'X-CP-Notebook-Team':'9'},cache:'no-store'}));
  });
  it('confirms restoration, updates the tree, and removes the restored root from the list',async()=>{
    const {onRestored}=mount();await open();vi.mocked(apiJson).mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({...listing,items:[]});fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));
    await waitFor(()=>expect(onRestored).toHaveBeenCalledOnce());expect(confirmDialog).toHaveBeenCalledOnce();expect(apiJson).toHaveBeenCalledWith('/api/notebook/pages/4/restore',expect.objectContaining({method:'POST',body:JSON.stringify({destination:{}})}));
    expect(screen.queryByText('Build notes')).toBeNull();expect(screen.getByRole('status')).toHaveTextContent('restored');expect(screen.getByRole('button',{name:'Refresh'})).toHaveFocus();
  });
  it('requires an explicit active destination after the original parent is unavailable',async()=>{
    mount();await open();vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(409,'Original parent unavailable',{destinationRequired:true}));fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));
    await screen.findByRole('region',{name:'Restore destination'});expect(screen.getByLabelText('Section')).toHaveValue('2');
    vi.mocked(apiJson).mockResolvedValueOnce({ok:true});fireEvent.click(screen.getByRole('button',{name:'Restore here'}));
    await waitFor(()=>expect(apiJson).toHaveBeenCalledWith('/api/notebook/pages/4/restore',expect.objectContaining({body:JSON.stringify({destination:{sectionId:2,parentId:null}})})));
  });
  it('clears previously visible metadata when a refresh loses authorization',async()=>{
    mount();await open();vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(403,'Notebook permission required'));fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
    await screen.findByRole('alert');expect(screen.queryByText('Build notes')).toBeNull();expect(screen.queryByRole('button',{name:'Load older items'})).toBeNull();
  });
  it('does not restore after cancellation or expose restore controls without organize grants',async()=>{
    mount();await open();vi.mocked(confirmDialog).mockResolvedValueOnce(false);fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh'})).not.toBeDisabled());expect(apiJson).toHaveBeenCalledOnce();
    cleanup();mount(false);await open();expect(screen.queryByRole('button',{name:'Restore page Build notes'})).toBeNull();expect(screen.getByText('Restoration also requires permission to organize the notebook.')).toBeTruthy();
  });
  it('aborts a restoration on unmount and ignores its late successful response',async()=>{
    const {unmount,onRestored}=mount();await open();let finish!:(value:any)=>void;vi.mocked(apiJson).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));
    await waitFor(()=>expect(apiJson).toHaveBeenCalledTimes(2));const signal=vi.mocked(apiJson).mock.calls[1][1]?.signal;unmount();expect(signal?.aborted).toBe(true);finish({ok:true});await Promise.resolve();expect(onRestored).not.toHaveBeenCalled();
  });
  it('can dismiss a stalled read, abort it, and reopen without accepting the old response',async()=>{
    mount();let finish!:(value:any)=>void;vi.mocked(apiJson).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole('button',{name:'Trash'}));
    await screen.findByRole('dialog');const signal=vi.mocked(apiJson).mock.calls[0][1]?.signal;fireEvent.click(screen.getByRole('button',{name:'Close'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(signal?.aborted).toBe(true);
    await open();finish({...listing,items:[{...item,title:'Stale private title'}]});await Promise.resolve();expect(screen.queryByText('Stale private title')).toBeNull();
  });
  it('reloads newly visible child tombstones and resets pagination after a parent returns',async()=>{
    mount();await open();vi.mocked(apiJson).mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({...listing,items:[{...item,id:8,title:'Independently deleted child'}],nextCursor:'new-cursor'});fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));
    await screen.findByText('Independently deleted child');expect(screen.queryByText('Build notes')).toBeNull();expect(screen.getByRole('button',{name:'Load older items'})).toBeTruthy();
    expect(apiJson).toHaveBeenLastCalledWith('/api/notebook/trash',expect.objectContaining({cache:'no-store'}));
  });
  it('identifies section restore destinations by notebook and section title',async()=>{
    const duplicate={...tree,notebooks:[...tree.notebooks,{id:3,title:'Later season',sort:1,color:null}],sections:[...tree.sections,{...tree.sections[0],id:7,notebookId:3}]};
    render(<NotebookTrash teamId={9} tree={duplicate} onRestored={vi.fn()}/>);await open();fireEvent.click(screen.getByRole('button',{name:'Choose destination'}));
    expect(screen.getByRole('option',{name:'Team notebook / Build'})).toBeTruthy();expect(screen.getByRole('option',{name:'Later season / Build'})).toBeTruthy();
  });
});
