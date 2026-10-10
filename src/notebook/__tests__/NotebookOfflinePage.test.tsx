import 'fake-indexeddb/auto';
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {NotebookPage} from '../NotebookPage';
import {ApiError,apiJson} from '../../services/api';
import {cacheNotebookTree,clearCachedNotebookTrees,readCachedNotebookTree} from '../offlineTree';
import type {NotebookTree} from '../types';
import {clearNotebookData} from '../notebookRuntime';
vi.mock('../../services/api',async original=>({...await original<any>(),apiJson:vi.fn()}));
vi.mock('../NotebookEditor',()=>({NotebookEditor:()=>null,downloadNotebookJSON:vi.fn()}));
vi.mock('../useNotebookMobile',()=>({useNotebookMobile:()=>false}));
const scope={memberId:10,teamId:20};
const tree:NotebookTree={notebooks:[{id:1,title:'Season',color:null,sort:0}],sections:[{id:2,notebookId:1,title:'Build',color:null,sort:0,protected:false,defaultTemplate:null,dateStamp:false}],pages:[{id:4,sectionId:2,parentId:null,title:'Ordinary page',sort:0,protected:false,ownProtected:false,revision:1,updatedAt:'now'}],permissions:{read:true,edit:true,organize:true,delete:true,protect:true}};
afterEach(async()=>{cleanup();vi.resetAllMocks();await clearCachedNotebookTrees();});
function mount(){return render(<MemoryRouter><NotebookPage activeTeamId={20} currentUserId={10}/></MemoryRouter>);}
describe('offline notebook navigation recovery',()=>{
  it('shows cached ordinary navigation on reload and restores live capabilities on reconnect',async()=>{
    await cacheNotebookTree(scope,tree);let connected=false;
    vi.mocked(apiJson).mockImplementation(async path=>{if(path==='/api/notebook/tree'){if(!connected)throw new TypeError('Offline');return tree as any;}return [] as any;});
    mount();expect(await screen.findByRole('button',{name:'Ordinary page'})).toBeTruthy();expect(screen.getByText(/Offline navigation ·/)).toBeTruthy();expect(screen.queryByRole('button',{name:'New page'})).toBeNull();expect(screen.queryByRole('button',{name:'Quick note'})).toBeNull();
    connected=true;fireEvent.click(screen.getByRole('button',{name:'Retry connection'}));expect(await screen.findByRole('button',{name:'New page'})).toBeTruthy();expect(screen.queryByText(/Offline navigation ·/)).toBeNull();
  });
  it('never falls back to cached navigation on a known access denial',async()=>{
    await cacheNotebookTree(scope,tree);vi.mocked(apiJson).mockRejectedValue(new ApiError(403,'Notebook access denied'));
    mount();expect(await screen.findByRole('alert')).toHaveTextContent('Notebook access denied');expect(screen.queryByRole('button',{name:'Ordinary page'})).toBeNull();expect(await readCachedNotebookTree(scope)).toBeUndefined();
  });
  it('does not expose another account cache or invent an offline tree when none exists',async()=>{
    await cacheNotebookTree({...scope,memberId:99},tree);vi.mocked(apiJson).mockRejectedValue(new TypeError('No connection'));
    mount();await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('No connection'));expect(screen.queryByRole('button',{name:'Ordinary page'})).toBeNull();expect(screen.queryByText('Loading notebooks…')).toBeNull();expect(screen.getByRole('button',{name:'Retry navigation'})).toBeEnabled();
  });
  it('ignores a delayed tree response after logout cleanup while the page remains mounted',async()=>{
    let respond!:(value:NotebookTree)=>void;vi.mocked(apiJson).mockImplementation(path=>path==='/api/notebook/tree'?new Promise(resolve=>{respond=resolve;}):Promise.resolve([] as any));
    mount();await waitFor(()=>expect(apiJson).toHaveBeenCalled());await clearNotebookData();await act(async()=>{respond(tree);});
    expect(screen.queryByRole('button',{name:'Ordinary page'})).toBeNull();expect(await readCachedNotebookTree(scope)).toBeUndefined();
  });
});
