import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NotebookQuickNote,quickNoteDocument} from '../NotebookQuickNote';
import {apiJson} from '../../services/api';
import type {NotebookTree} from '../types';
vi.mock('../../services/api',()=>({apiJson:vi.fn()}));
const tree:NotebookTree={notebooks:[{id:1,title:'Season',sort:0,color:null}],sections:[{id:2,notebookId:1,title:'Build',sort:0,color:null,protected:false,defaultTemplate:null,dateStamp:false},{id:3,notebookId:1,title:'Admin notes',sort:1,color:null,protected:true,defaultTemplate:null,dateStamp:false}],pages:[],permissions:{read:true,edit:true,organize:true,delete:true,protect:true}};
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mount(value=tree){const onSaved=vi.fn(),onOpen=vi.fn();const view=render(<NotebookQuickNote tree={value} teamId={20} sectionId={2} onSaved={onSaved} onOpen={onOpen}/>);return {onSaved,onOpen,view};}
function write(){fireEvent.click(screen.getByRole('button',{name:'Quick note'}));fireEvent.change(screen.getByLabelText('Note',{exact:true}),{target:{value:'First\n\n<script>literal</script>'}});}
describe('desktop quick team capture',()=>{
  it('saves real editable paragraphs to the explicit scoped destination without navigating',async()=>{
    vi.mocked(apiJson).mockResolvedValueOnce(tree).mockResolvedValueOnce({id:90});const {onSaved,onOpen}=mount();write();
    fireEvent.change(screen.getByLabelText('Save to section'),{target:{value:'3'}});expect(screen.getByText('Only team admins can access this note.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Save note'}));await screen.findByText('Quick note saved.');
    const [path,options]=vi.mocked(apiJson).mock.calls[1];expect(path).toBe('/api/notebook/pages');expect(options?.headers).toEqual({'X-CP-Notebook-Team':'20'});
    expect(JSON.parse(String(options?.body))).toEqual({title:'Quick note',sectionId:3,parentId:null,content:quickNoteDocument('First\n\n<script>literal</script>')});
    expect(onSaved).toHaveBeenCalledOnce();expect(onOpen).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Open saved note'}));expect(onOpen).toHaveBeenCalledWith(90);
    fireEvent.click(screen.getByRole('button',{name:'Quick note'}));expect(screen.getByLabelText('Note',{exact:true})).toHaveValue('');
  });
  it('retains a draft on close and on a failed save',async()=>{
    vi.mocked(apiJson).mockResolvedValueOnce(tree).mockRejectedValueOnce(new Error('Offline'));mount();write();
    fireEvent.click(screen.getByRole('button',{name:'Close draft'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Quick note'})).toHaveFocus());fireEvent.click(screen.getByRole('button',{name:'Quick note'}));expect(screen.getByLabelText('Note',{exact:true})).toHaveValue('First\n\n<script>literal</script>');
    fireEvent.click(screen.getByRole('button',{name:'Save note'}));await screen.findByRole('alert');expect(screen.getByLabelText('Note',{exact:true})).toHaveValue('First\n\n<script>literal</script>');
    expect(screen.getByRole('button',{name:'Save note'})).toBeEnabled();
  });
  it('rechecks editing rights and section availability before any create',async()=>{
    vi.mocked(apiJson).mockResolvedValue({...tree,permissions:{...tree.permissions,edit:false}});mount();write();fireEvent.click(screen.getByRole('button',{name:'Save note'}));
    await screen.findByRole('alert');expect(apiJson).toHaveBeenCalledTimes(1);
    vi.mocked(apiJson).mockResolvedValue({...tree,sections:[]});fireEvent.click(screen.getByRole('button',{name:'Save note'}));await waitFor(()=>expect(apiJson).toHaveBeenCalledTimes(2));expect(screen.getByLabelText('Note',{exact:true})).toHaveValue('First\n\n<script>literal</script>');
  });
  it('claims a save synchronously and disables closing while its request is pending',async()=>{
    let release!:(value:NotebookTree)=>void;vi.mocked(apiJson).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValueOnce({id:91});mount();write();
    fireEvent.click(screen.getByRole('button',{name:'Save note'}));fireEvent.submit(screen.getByLabelText('Note',{exact:true}).closest('form')!);expect(apiJson).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Close draft'})).toBeDisabled();
    await act(async()=>release(tree));await screen.findByText('Quick note saved.');expect(apiJson).toHaveBeenCalledTimes(2);
  });
  it('disables capture for read-only teams and keeps multiline text literal',()=>{
    mount({...tree,permissions:{...tree.permissions,edit:false}});expect(screen.getByRole('button',{name:'Quick note'})).toBeDisabled();
    expect(quickNoteDocument('a\r\nb\r\nc')).toEqual({type:'doc',content:['a','b','c'].map(text=>({type:'paragraph',content:[{type:'text',text}]}))});
  });
  it('clears an in-memory draft when its section disappears from the authorized tree',()=>{
    const {view}=mount();write();
    view.rerender(<NotebookQuickNote tree={{...tree,sections:[tree.sections[1]]}} teamId={20} sectionId={null} onSaved={()=>{}} onOpen={()=>{}}/>);
    expect(screen.getByLabelText('Note',{exact:true})).toHaveValue('');expect(screen.getByRole('alert')).toHaveTextContent('draft was cleared');
    expect(screen.getByRole('alert')).not.toHaveTextContent('draft is retained');expect(screen.getByLabelText('Save to section')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Save to section'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('Note',{exact:true}),{target:{value:'New draft'}});expect(screen.getByRole('button',{name:'Save note'})).toBeEnabled();
  });
  it('keeps the desktop draft while hiding all capture UI at mobile widths',()=>{
    const {view}=mount();write();
    view.rerender(<NotebookQuickNote hidden tree={tree} teamId={20} sectionId={2} onSaved={()=>{}} onOpen={()=>{}}/>);
    expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByRole('button',{name:'Quick note'})).toBeNull();
    view.rerender(<NotebookQuickNote tree={tree} teamId={20} sectionId={2} onSaved={()=>{}} onOpen={()=>{}}/>);
    expect(screen.getByLabelText('Note',{exact:true})).toHaveValue('First\n\n<script>literal</script>');
  });
});
