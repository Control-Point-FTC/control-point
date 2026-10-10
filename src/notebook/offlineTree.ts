import type {NotebookTree} from './types';
type Scope={memberId:number;teamId:number};
type Snapshot={key:string;schema:1;savedAt:string;tree:NotebookTree};
let opening:Promise<IDBDatabase>|undefined,queue:Promise<unknown>=Promise.resolve();
const key=(scope:Scope)=>`${scope.memberId}:${scope.teamId}`;
function database(){
  if(!globalThis.indexedDB)return Promise.reject(new Error('Offline notebook navigation is unavailable on this device.'));
  return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('cp-notebook-navigation',1);let rejected=false;
    request.onupgradeneeded=()=>request.result.createObjectStore('trees',{keyPath:'key'});
    request.onerror=request.onblocked=()=>{rejected=true;opening=undefined;reject(request.error??new Error('Cannot open offline notebook navigation.'));};
    request.onsuccess=()=>{const db=request.result;if(rejected){db.close();return;}db.onversionchange=()=>{db.close();opening=undefined;};resolve(db);};
  });
}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>){
  const db=await database();return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('trees',mode),request=run(tx.objectStore('trees'));
    tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(tx.error??request.error??new Error('Offline notebook navigation could not be saved.'));
  });
}
function ordered<T>(run:()=>Promise<T>){const next=queue.catch(()=>{}).then(run);queue=next;return next;}
/** Cache only ordinary metadata, with browsing rights rather than cached admin rights. */
export function ordinaryNotebookTree(tree:NotebookTree):NotebookTree {
  const sections=tree.sections.filter(s=>s.protected===false),sectionIds=new Set(sections.map(s=>s.id));
  const allowed=tree.pages.filter(p=>p.protected===false&&sectionIds.has(p.sectionId)),pagesById=new Map(allowed.map(p=>[p.id,p]));
  const pages=allowed.filter(page=>{
    let parent=page.parentId;const visited=new Set([page.id]);
    while(parent!=null){const ancestor=pagesById.get(parent);if(!ancestor||ancestor.sectionId!==page.sectionId||visited.has(parent)||visited.size>=6)return false;visited.add(parent);parent=ancestor.parentId;}
    return true;
  });
  const bookIds=new Set(sections.map(s=>s.notebookId));
  return {notebooks:tree.notebooks.filter(n=>bookIds.has(n.id)),sections,pages,permissions:{read:true,edit:false,organize:false,delete:false,protect:false}};
}
export function cacheNotebookTree(scope:Scope,tree:NotebookTree){return ordered(async()=>{
  if(!tree.permissions.read){await transaction('readwrite',store=>store.delete(key(scope)));return;}
  const snapshot:Snapshot={key:key(scope),schema:1,savedAt:new Date().toISOString(),tree:ordinaryNotebookTree(tree)};
  if(JSON.stringify(snapshot).length>2000000)throw new Error('This notebook is too large to cache its navigation on this device.');
  await transaction('readwrite',store=>store.put(snapshot));
});}
export function readCachedNotebookTree(scope:Scope){return ordered(async()=>{
  const snapshot=await transaction<Snapshot|undefined>('readonly',store=>store.get(key(scope)));
  if(!snapshot||snapshot.schema!==1||snapshot.key!==key(scope)||!snapshot.tree?.permissions?.read)return undefined;
  // Re-filter on read so older cached rights never become active authorizations.
  return {...snapshot,tree:ordinaryNotebookTree(snapshot.tree)};
});}
export function forgetCachedNotebookTree(scope:Scope){return ordered(async()=>{await transaction('readwrite',store=>store.delete(key(scope)));});}
export function clearCachedNotebookTrees(){return ordered(async()=>{await transaction('readwrite',store=>store.clear());});}
