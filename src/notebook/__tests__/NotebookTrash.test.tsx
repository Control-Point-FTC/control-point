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
  it('loads only on explicit open and paginates older entries under current team scope',async()=>{
    mount();expect(apiJson).not.toHaveBeenCalled();vi.mocked(apiJson).mockResolvedValueOnce({...listing,nextCursor:'continuation'});await open();
    expect(screen.getByText('page · Deleted by Ana')).toBeTruthy();
    vi.mocked(apiJson).mockResolvedValueOnce({...listing,items:[{...item,id:5,title:'Older notes'}]});fireEvent.click(screen.getByRole('button',{name:'Load older items'}));await screen.findByText('Older notes');
    expect(screen.getByText('Build notes')).toBeTruthy();expect(apiJson).toHaveBeenLastCalledWith('/api/notebook/trash?cursor=continuation',expect.objectContaining({headers:{'X-CP-Notebook-Team':'9'},cache:'no-store'}));
  });
  it('confirms restoration, updates the tree, and removes the restored root from the list',async()=>{
    const {onRestored}=mount();await open();vi.mocked(apiJson).mockResolvedValueOnce({ok:true});fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));
    await waitFor(()=>expect(onRestored).toHaveBeenCalledOnce());expect(confirmDialog).toHaveBeenCalledOnce();expect(apiJson).toHaveBeenLastCalledWith('/api/notebook/pages/4/restore',expect.objectContaining({method:'POST',body:JSON.stringify({destination:{}})}));
    expect(screen.queryByText('Build notes')).toBeNull();expect(screen.getByRole('status')).toHaveTextContent('restored');expect(screen.getByRole('button',{name:'Refresh'})).toHaveFocus();
  });
  it('requires an explicit active destination after the original parent is unavailable',async()=>{
    mount();await open();vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(409,'Original parent unavailable',{destinationRequired:true}));fireEvent.click(screen.getByRole('button',{name:'Restore page Build notes'}));
    await screen.findByRole('region',{name:'Restore destination'});expect(screen.getByLabelText('Section')).toHaveValue('2');
    vi.mocked(apiJson).mockResolvedValueOnce({ok:true});fireEvent.click(screen.getByRole('button',{name:'Restore here'}));
    await waitFor(()=>expect(apiJson).toHaveBeenLastCalledWith('/api/notebook/pages/4/restore',expect.objectContaining({body:JSON.stringify({destination:{sectionId:2,parentId:null}})})));
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
});
