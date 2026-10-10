import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {NotebookSplitView} from '../NotebookSplitView';
import type {NotebookSync} from '../NotebookSync';
const sessions=vi.hoisted(()=>({created:[] as any[]}));
vi.mock('../NotebookSync',()=>({NotebookSync:class{
  pending=false;pageId:number;scope:any;status='saved';
  start=vi.fn();resume=vi.fn();release=vi.fn().mockResolvedValue(undefined);discardRecovery=vi.fn().mockResolvedValue(undefined);flush=vi.fn().mockResolvedValue(true);persist=vi.fn().mockResolvedValue(true);
  constructor(id:number,scope:any){this.pageId=id;this.scope=scope;sessions.created.push(this);}
}}));
vi.mock('../notebookRuntime',()=>({findNotebookSession:vi.fn(()=>undefined)}));
vi.mock('../NotebookEditor',()=>({NotebookEditor:(props:any)=><div data-testid={`editor-${props.sync.pageId}`}><span>{props.toolbarVisible?`Ribbon ${props.sync.pageId}`:''}</span><input aria-label={`Edit page ${props.sync.pageId}`} defaultValue="Saved text"/><button onClick={()=>props.onOpenOther(3,'target')}>Open link in other pane {props.sync.pageId}</button><span>{props.blockTarget??'No block'}</span></div>}));
const pages=[1,2,3].map(id=>({id,title:`Page ${id}`,sectionId:1,parentId:null,sort:id,protected:false,ownProtected:false,revision:1,updatedAt:'now'}));
let primary:NotebookSync;
const props=()=>({sync:primary,pages,mobile:false,onChanged:vi.fn(),onNavigate:vi.fn()});
beforeEach(()=>{sessions.created=[];primary={pageId:1,scope:{memberId:10,teamId:20}} as NotebookSync;});afterEach(()=>{cleanup();vi.clearAllMocks();});
async function open(){fireEvent.click(screen.getByRole('button',{name:'Split view'}));await screen.findByTestId('editor-2');}
it('keeps both documents mounted while changing ribbon ownership, swapping and resizing',async()=>{
  render(<NotebookSplitView {...props()}/>);await open();expect(screen.getByText('Ribbon 2')).toBeTruthy();expect(screen.queryByText('Ribbon 1')).toBeNull();
  const input=screen.getByLabelText('Edit page 2');fireEvent.change(input,{target:{value:'Unsaved typing'}});fireEvent.focus(screen.getByLabelText('Edit page 1'));expect(screen.getByText('Ribbon 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Swap panes'}));expect(screen.getByLabelText('Edit page 2')).toBe(input);expect(input).toHaveValue('Unsaved typing');expect(sessions.created[0].release).not.toHaveBeenCalled();
  const divider=screen.getByRole('separator',{name:'Resize notebook panes'});fireEvent.keyDown(divider,{key:'ArrowRight'});expect(divider).toHaveAttribute('aria-valuenow','45');fireEvent.keyDown(divider,{key:'End'});expect(divider).toHaveAttribute('aria-valuenow','75');
});
it('refuses to replace or close a pane when its changes cannot be saved or persisted',async()=>{
  render(<NotebookSplitView {...props()}/>);await open();const current=sessions.created[0];current.pending=true;current.flush.mockResolvedValue(false);current.persist.mockResolvedValue(false);
  fireEvent.change(screen.getByLabelText('Page in other pane'),{target:{value:'3'}});await screen.findByRole('alert');expect(screen.getByTestId('editor-2')).toBeTruthy();expect(sessions.created).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Close other page'}));await waitFor(()=>expect(current.flush).toHaveBeenCalledTimes(2));expect(current.release).not.toHaveBeenCalled();
});
it('persists an offline page before replacing it and scopes the new linked page independently',async()=>{
  const navigate=vi.fn();render(<NotebookSplitView {...props()} onNavigate={navigate}/>);await open();const current=sessions.created[0];current.pending=true;current.flush.mockResolvedValue(false);current.persist.mockResolvedValue(true);
  fireEvent.click(screen.getByRole('button',{name:'Open link in other pane 1'}));await screen.findByTestId('editor-3');expect(current.persist).toHaveBeenCalledOnce();expect(current.release).toHaveBeenCalledOnce();expect(sessions.created[1].scope).toEqual(primary.scope);expect(navigate).not.toHaveBeenCalled();expect(within(screen.getByTestId('editor-3')).getByText('target')).toBeTruthy();
});
it('clears a revoked page and removes its recovery state',async()=>{
  const view=render(<NotebookSplitView {...props()}/>);await open();const current=sessions.created[0];view.rerender(<NotebookSplitView {...props()} pages={pages.filter(page=>page.id!==2)}/>);
  expect(screen.queryByTestId('editor-2')).toBeNull();expect(current.discardRecovery).toHaveBeenCalledOnce();expect(screen.getByText('Ribbon 1')).toBeTruthy();
});
it('transfers a session to the main pane without releasing it when its page is selected there',async()=>{
  const view=render(<NotebookSplitView {...props()}/>);await open();const current=sessions.created[0];view.rerender(<NotebookSplitView {...props()} sync={current}/>);
  expect(screen.queryByRole('region',{name:'Other notebook page'})).toBeNull();expect(current.release).not.toHaveBeenCalled();expect(screen.getAllByTestId('editor-2')).toHaveLength(1);
});
it('keeps mobile to one text editor and releases the owned secondary session on teardown',async()=>{
  const view=render(<NotebookSplitView {...props()}/>);await open();const current=sessions.created[0];view.rerender(<NotebookSplitView {...props()} mobile/>);
  expect(screen.queryByTestId('editor-2')).toBeNull();expect(screen.queryByRole('button',{name:'Split view'})).toBeNull();expect(screen.getByText('Ribbon 1')).toBeTruthy();view.unmount();expect(current.release).toHaveBeenCalledOnce();
});
