import 'fake-indexeddb/auto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cacheNotebookTree,clearCachedNotebookTrees,forgetCachedNotebookTree,ordinaryNotebookTree,readCachedNotebookTree,notebookNavigationEpoch} from '../offlineTree';
import {clearNotebookData} from '../notebookRuntime';
import type {NotebookTree} from '../types';
const scope={memberId:10,teamId:20};
const tree:NotebookTree={notebooks:[{id:1,title:'Season',color:null,sort:0}],sections:[{id:2,notebookId:1,title:'Build',color:null,sort:0,protected:false,defaultTemplate:null,dateStamp:false},{id:3,notebookId:1,title:'Secret admin section',color:null,sort:1,protected:true,defaultTemplate:null,dateStamp:false}],pages:[{id:4,sectionId:2,parentId:null,title:'Ordinary',sort:0,protected:false,ownProtected:false,revision:1,updatedAt:'now'},{id:5,sectionId:3,parentId:null,title:'Secret child',sort:0,protected:true,ownProtected:false,revision:1,updatedAt:'now'},{id:6,sectionId:2,parentId:null,title:'Secret page',sort:1,protected:true,ownProtected:true,revision:1,updatedAt:'now'},{id:7,sectionId:2,parentId:6,title:'Inconsistent child',sort:0,protected:false,ownProtected:false,revision:1,updatedAt:'now'}],permissions:{read:true,edit:true,organize:true,delete:true,protect:true}};
afterEach(async()=>{vi.restoreAllMocks();await clearCachedNotebookTrees();});
describe('ordinary offline notebook navigation',()=>{
  it('excludes protected hierarchies and does not preserve admin or mutation capabilities',async()=>{
    await cacheNotebookTree(scope,tree);const snapshot=await readCachedNotebookTree(scope);
    expect(snapshot?.tree.sections.map(s=>s.id)).toEqual([2]);expect(snapshot?.tree.pages.map(p=>p.id)).toEqual([4]);
    expect(JSON.stringify(snapshot)).not.toContain('Secret');expect(snapshot?.tree.permissions).toEqual({read:true,edit:false,organize:false,delete:false,protect:false});
  });
  it('isolates accounts/workspaces and supports ordered replacement/removal',async()=>{
    const write=cacheNotebookTree(scope,tree),remove=forgetCachedNotebookTree(scope);await Promise.all([write,remove]);expect(await readCachedNotebookTree(scope)).toBeUndefined();
    await cacheNotebookTree(scope,tree);expect(await readCachedNotebookTree({...scope,memberId:11})).toBeUndefined();expect(await readCachedNotebookTree({...scope,teamId:21})).toBeUndefined();
    await cacheNotebookTree(scope,{...tree,pages:[]});expect((await readCachedNotebookTree(scope))?.tree.pages).toEqual([]);
  });
  it('removes known forbidden snapshots and clears navigation during logout cleanup',async()=>{
    await cacheNotebookTree(scope,tree);await cacheNotebookTree(scope,{...tree,permissions:{...tree.permissions,read:false}});expect(await readCachedNotebookTree(scope)).toBeUndefined();
    await cacheNotebookTree(scope,tree);await clearNotebookData();expect(await readCachedNotebookTree(scope)).toBeUndefined();
  });
  it('rejects orphaned, cyclic and foreign-section descendants',()=>{
    const value={...tree,pages:[...tree.pages,{...tree.pages[0],id:8,parentId:9},{...tree.pages[0],id:9,parentId:8},{...tree.pages[0],id:10,parentId:99},{...tree.pages[0],id:11,sectionId:99}]};
    expect(ordinaryNotebookTree(value).pages.map(p=>p.id)).toEqual([4]);
  });
  it('removes an old snapshot when its oversized replacement cannot be cached',async()=>{
    await cacheNotebookTree(scope,tree);
    const large={...tree,pages:Array.from({length:12000},(_,i)=>({...tree.pages[0],id:100+i,title:'x'.repeat(200)}))};
    await expect(cacheNotebookTree(scope,large)).rejects.toThrow('too large');expect(await readCachedNotebookTree(scope)).toBeUndefined();
  });
  it('removes old titles when a replacement write fails from quota exhaustion',async()=>{
    await cacheNotebookTree(scope,tree);vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(()=>{throw new DOMException('Full','QuotaExceededError');});
    await expect(cacheNotebookTree(scope,{...tree,pages:[]})).rejects.toThrow('Full');expect(await readCachedNotebookTree(scope)).toBeUndefined();
  });
  it('invalidates old owner writes synchronously before asynchronous cleanup completes',async()=>{
    const owner=notebookNavigationEpoch();await cacheNotebookTree(scope,tree,owner);
    const clear=clearCachedNotebookTrees(),delayed=cacheNotebookTree(scope,tree,owner);await Promise.all([clear,delayed]);
    expect(await readCachedNotebookTree(scope)).toBeUndefined();
    await cacheNotebookTree(scope,tree,notebookNavigationEpoch());expect((await readCachedNotebookTree(scope))?.tree.pages.map(p=>p.id)).toEqual([4]);
  });
});
