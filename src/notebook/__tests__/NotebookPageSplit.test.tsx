import React from 'react';
import * as Y from 'yjs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useNavigate,useLocation} from 'react-router-dom';
import {NotebookPage} from '../NotebookPage';
import {apiJson} from '../../services/api';
const sessions=vi.hoisted(()=>({created:[] as any[]}));
vi.mock('../../services/api',async original=>({...await original<any>(),apiJson:vi.fn()}));
vi.mock('../NotebookSync',async()=>{
  const {registerNotebookSession}=await import('../notebookRuntime');
  return {NotebookSync:class{
    pageId:number;scope:any;pending=false;locallyDurable=true;status='saved';doc=new Y.Doc();unregister:()=>void;
    start=vi.fn().mockResolvedValue(undefined);resume=vi.fn();flush=vi.fn().mockResolvedValue(true);persist=vi.fn().mockResolvedValue(true);
    release=vi.fn(async()=>{this.unregister();});destroy=vi.fn(()=>this.unregister());discardRecovery=vi.fn(async()=>{this.unregister();});
    constructor(id:number,scope:any){this.pageId=id;this.scope=scope;this.doc.getMap('meta').set('title',`Page ${id}`);this.unregister=registerNotebookSession(this as any);sessions.created.push(this);}
  }};
});
vi.mock('../NotebookEditor',()=>({downloadNotebookJSON:vi.fn(),NotebookEditor:(props:any)=><div data-testid={`editor-${props.sync.pageId}`}><button onClick={()=>props.onNavigate(4)}>Navigate main to page 4</button><button onClick={()=>props.onNavigate(3)}>Navigate main to page 3</button></div>}));
vi.mock('../useNotebookMobile',()=>({useNotebookMobile:()=>false}));
const pages=[2,3,4].map(id=>({id,sectionId:1,parentId:null,title:`Page ${id}`,sort:id,protected:false,ownProtected:false,revision:1,updatedAt:'now'}));
beforeEach(()=>{
  sessions.created=[];vi.mocked(apiJson).mockImplementation(async path=>{
    if(path==='/api/notebook/tree')return {notebooks:[{id:1,title:'Team notebook',sort:0,color:null}],sections:[{id:1,notebookId:1,title:'Build',sort:0,color:null,protected:false}],pages,permissions:{read:true,edit:true,organize:true,delete:true,protect:true}} as any;
    if(path==='/api/notebook/mentions')return [] as any;throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(()=>{cleanup();sessions.created.forEach(session=>{session.unregister();session.doc.destroy();});vi.clearAllMocks();localStorage.clear();});
function NavigationProbe(){const navigate=useNavigate(),location=useLocation();return <><button onClick={()=>navigate('/dashboard')}>Leave notebook</button><output data-testid="route-path">{location.pathname}</output></>;}
async function mount(){render(<MemoryRouter initialEntries={['/notebook?page=2']}><NotebookPage activeTeamId={20} currentUserId={10}/><NavigationProbe/></MemoryRouter>);await screen.findByTestId('editor-2');fireEvent.click(screen.getByRole('button',{name:'Split view'}));await screen.findByTestId('editor-3');return sessions.created.find(session=>session.pageId===3);}
it('keeps the actual split workspace mounted through main-route page changes',async()=>{
  const secondary=await mount(),element=screen.getByTestId('editor-3');
  fireEvent.click(screen.getAllByRole('button',{name:'Navigate main to page 4'})[0]);await screen.findByTestId('editor-4');
  expect(screen.getByTestId('editor-3')).toBe(element);expect(secondary.release).not.toHaveBeenCalled();expect(screen.getByRole('separator',{name:'Resize notebook panes'})).toBeTruthy();
});
it('keeps blocked offline secondary edits mounted while the main page changes',async()=>{
  const secondary=await mount(),element=screen.getByTestId('editor-3');
  secondary.pending=true;secondary.locallyDurable=false;secondary.flush.mockResolvedValue(false);secondary.persist.mockResolvedValue(false);
  fireEvent.click(screen.getAllByRole('button',{name:'Navigate main to page 4'})[0]);
  await screen.findByTestId('editor-4');expect(screen.getByTestId('editor-3')).toBe(element);
  expect(secondary.flush).not.toHaveBeenCalled();expect(secondary.persist).not.toHaveBeenCalled();expect(secondary.release).not.toHaveBeenCalled();
});
it('still guards every unsaved pane when leaving the notebook',async()=>{
  const secondary=await mount();secondary.pending=true;secondary.locallyDurable=false;
  secondary.flush.mockResolvedValue(false);secondary.persist.mockResolvedValue(false);
  fireEvent.click(screen.getByRole('button',{name:'Leave notebook'}));
  await screen.findByText('Save or recover your notebook changes before leaving this page.');
  expect(secondary.flush).toHaveBeenCalled();expect(secondary.persist).toHaveBeenCalled();
  expect(screen.getByTestId('route-path')).toHaveTextContent('/notebook');
  secondary.flush.mockImplementation(async()=>{secondary.pending=false;return true;});
  fireEvent.click(screen.getByRole('button',{name:'Leave notebook'}));
  await waitFor(()=>expect(screen.getByTestId('route-path')).toHaveTextContent('/dashboard'));
});
it('adopts the actual secondary session when the main route selects its page',async()=>{
  const secondary=await mount();fireEvent.click(screen.getAllByRole('button',{name:'Navigate main to page 3'})[0]);
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Other notebook page'})).toBeNull());expect(screen.getAllByTestId('editor-3')).toHaveLength(1);expect(secondary.release).not.toHaveBeenCalled();expect(sessions.created.filter(session=>session.pageId===3)).toHaveLength(1);
});
