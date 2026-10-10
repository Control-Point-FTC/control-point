import React,{useEffect,useRef,useState} from 'react';
import {ArchiveRestore,BookOpen,FileText,Folder,RefreshCw,Trash2} from 'lucide-react';
import {ApiError,apiJson} from '../services/api';
import {confirmDialog} from '../components/dialog';
import {Button,Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,Label} from '../components/ui-kit';
import type {NotebookPageData,NotebookTree} from './types';
import {revisionPreview} from './revisionPreview';
import './trash.css';

type Entry={id:number;kind:'notebook'|'section'|'page';title:string;deletedAt:string;deletedBy:string};
type Listing={items:Entry[];nextCursor:string|null;retention:string};
const plurals={notebook:'notebooks',section:'sections',page:'pages'};
const key=(entry:Entry)=>`${entry.kind}:${entry.id}`;
function RetainedPreview({snapshot}:{snapshot:NotebookPageData}){
  try{return <div className="nb-trash-preview-document" dangerouslySetInnerHTML={{__html:revisionPreview(snapshot,'restore this page to open the file')}}/>;}
  catch(e){return <p role="alert">{e instanceof Error?e.message:'This retained page needs a compatible viewer.'}</p>;}
}

/** Explicit trash reads never cache protected metadata or open original files. */
export function NotebookTrash({teamId,tree,onRestored}:{teamId:number;tree:NotebookTree;onRestored:()=>void}){
  const [open,setOpen]=useState(false),[items,setItems]=useState<Entry[]>([]),[cursor,setCursor]=useState<string|null>(null),[retention,setRetention]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [destination,setDestination]=useState<Entry|null>(null),[book,setBook]=useState(''),[section,setSection]=useState(''),[parent,setParent]=useState('');
  const [preview,setPreview]=useState<NotebookPageData|null>(null);
  const request=useRef<AbortController|null>(null),locked=useRef(false),refreshButton=useRef<HTMLButtonElement|null>(null),restoreFocus=useRef(false);
  useEffect(()=>{if(!busy&&restoreFocus.current){restoreFocus.current=false;refreshButton.current?.focus();}},[busy]);
  const headers={'X-CP-Notebook-Team':String(teamId)};
  const begin=()=>{request.current?.abort();const abort=new AbortController();request.current=abort;locked.current=true;setBusy(true);setError('');return abort;};
  const finish=(abort:AbortController)=>{if(!abort.signal.aborted){locked.current=false;setBusy(false);}};
  const load=async(continuation?:string)=>{
    if(locked.current)return;const abort=begin();setPreview(null);
    try{
      const result=await apiJson<Listing>(`/api/notebook/trash${continuation?`?cursor=${encodeURIComponent(continuation)}`:''}`,{headers,cache:'no-store',signal:abort.signal});
      abort.signal.throwIfAborted();setItems(previous=>continuation?[...new Map([...previous,...result.items].map(item=>[key(item),item])).values()]:result.items);setCursor(result.nextCursor);setRetention(result.retention);
    }catch(e){if(!abort.signal.aborted){setItems([]);setCursor(null);setDestination(null);setError(e instanceof Error?e.message:'Cannot read notebook trash.');}}
    finally{finish(abort);}
  };
  useEffect(()=>{
    setItems([]);setCursor(null);setDestination(null);setPreview(null);setError('');setMessage('');setBusy(false);locked.current=false;
    if(open)void load();
    return ()=>{request.current?.abort();locked.current=false;};
  },[open,teamId]);
  const chooseDestination=(entry:Entry)=>{setDestination(entry);setBook(String(tree.notebooks[0]?.id??''));setSection(String(tree.sections[0]?.id??''));setParent('');};
  const inspect=async(entry:Entry)=>{
    if(locked.current)return;const abort=begin();setPreview(null);
    try{
      const snapshot=await apiJson<NotebookPageData>(`/api/notebook/trash/pages/${entry.id}`,{headers,cache:'no-store',signal:abort.signal});
      abort.signal.throwIfAborted();setPreview(snapshot);
    }catch(e){if(!abort.signal.aborted){if(e instanceof ApiError&&[401,403,404].includes(e.status)){setItems([]);setCursor(null);setDestination(null);}setError(e instanceof Error?e.message:'Cannot preview this retained page.');}}
    finally{finish(abort);}
  };
  const restore=async(entry:Entry,relocate=false)=>{
    if(locked.current)return;const abort=begin();setMessage('');
    try{
      if(!await confirmDialog({title:`Restore “${entry.title}”?`,message:'Retained notes and drawings return with their protection. Independently deleted children stay in trash. Previously connected editors must rejoin.',confirmLabel:'Restore'}))return;
      abort.signal.throwIfAborted();
      const to=relocate?(entry.kind==='section'?{notebookId:Number(book)}:{sectionId:Number(section),parentId:parent?Number(parent):null}):{};
      await apiJson(`/api/notebook/${plurals[entry.kind]}/${entry.id}/restore`,{method:'POST',headers,body:JSON.stringify({destination:to}),signal:abort.signal});
      abort.signal.throwIfAborted();setItems(previous=>previous.filter(item=>key(item)!==key(entry)));setDestination(null);setPreview(null);setMessage(`“${entry.title}” restored.`);restoreFocus.current=true;onRestored();
      // Restoring an ancestor can reveal independently deleted descendants.
      const refreshed=await apiJson<Listing>('/api/notebook/trash',{headers,cache:'no-store',signal:abort.signal});
      abort.signal.throwIfAborted();setItems(refreshed.items);setCursor(refreshed.nextCursor);setRetention(refreshed.retention);
    }catch(e){if(!abort.signal.aborted){
      if(e instanceof ApiError&&e.body?.destinationRequired){chooseDestination(entry);setError('The original parent is unavailable. Choose where to restore this item.');}
      else{if(e instanceof ApiError&&[401,403,404].includes(e.status)){setItems([]);setCursor(null);setDestination(null);setPreview(null);}setError(e instanceof Error?e.message:'Cannot restore this item.');}
    }}finally{finish(abort);}
  };
  if(!tree.permissions.delete)return null;
  return <>
    <Button className="nb-desktop nb-trash-entry" variant="ghost" onClick={()=>setOpen(true)}><Trash2 size={16}/> Trash</Button>
    <Dialog open={open} onOpenChange={value=>{if(!value){request.current?.abort();locked.current=false;setBusy(false);}setOpen(value);}}><DialogContent className="nb-trash-dialog"><DialogHeader><DialogTitle>Notebook trash</DialogTitle><DialogDescription>Deleted pages, sections and notebooks retained by your team.</DialogDescription></DialogHeader>
      <div className="nb-trash-actions"><Button ref={refreshButton} variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/> Refresh</Button><span>{items.length} loaded items</span></div>
      {error&&<p role="alert" className="nb-trash-error">{error}</p>}{message&&<p role="status" className="nb-trash-success">{message}</p>}{busy&&<p role="status">Working with notebook trash…</p>}
      {!busy&&!items.length&&!error&&<div className="nb-trash-empty"><Trash2 size={28}/><h3>Trash is empty</h3><p>Deleted notebook content will appear here.</p></div>}
      <ul className="nb-trash-items" aria-label="Deleted notebook items">{items.map(entry=>{const Icon=entry.kind==='page'?FileText:entry.kind==='section'?Folder:BookOpen;return <li key={key(entry)}><Icon size={20} aria-hidden="true"/><div><strong>{entry.title}</strong><span>{entry.kind} · Deleted by {entry.deletedBy}</span><time dateTime={entry.deletedAt}>{new Date(entry.deletedAt).toLocaleString()}</time></div><div className="nb-trash-item-actions">{entry.kind==='page'&&<Button variant="ghost" disabled={busy} aria-label={`Preview deleted page ${entry.title}`} onClick={()=>void inspect(entry)}>Preview</Button>}{tree.permissions.organize&&<><Button variant="outline" disabled={busy} aria-label={`Restore ${entry.kind} ${entry.title}`} onClick={()=>void restore(entry)}><ArchiveRestore size={15}/> Restore</Button>{entry.kind!=='notebook'&&<button disabled={busy} onClick={()=>chooseDestination(entry)}>Choose destination</button>}</>}</div></li>;})}</ul>
      {preview&&<section className="nb-trash-preview" aria-label="Retained page preview"><div><h3>{preview.title}</h3><Button variant="ghost" onClick={()=>setPreview(null)}>Close preview</Button></div><p>Read only · Original files open after restoration.</p><RetainedPreview snapshot={preview}/></section>}
      {destination&&<section className="nb-trash-destination" aria-label="Restore destination"><h3>Restore “{destination.title}” to</h3>
        {destination.kind==='section'?<><Label htmlFor="nb-restore-book">Notebook</Label><select id="nb-restore-book" disabled={busy} value={book} onChange={event=>setBook(event.target.value)}><option value="">Choose a notebook</option>{tree.notebooks.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></>:<><Label htmlFor="nb-restore-section">Section</Label><select id="nb-restore-section" disabled={busy} value={section} onChange={event=>{setSection(event.target.value);setParent('');}}><option value="">Choose a section</option>{tree.sections.map(item=><option key={item.id} value={item.id}>{tree.notebooks.find(book=>book.id===item.notebookId)?.title??'Notebook'} / {item.title}{item.protected?' · Admin only':''}</option>)}</select><Label htmlFor="nb-restore-parent">Parent page</Label><select id="nb-restore-parent" disabled={busy} value={parent} onChange={event=>setParent(event.target.value)}><option value="">Top level</option>{tree.pages.filter(item=>item.sectionId===Number(section)).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></>}
        <div><Button disabled={busy||!(destination.kind==='section'?book:section)} onClick={()=>void restore(destination,true)}>Restore here</Button><Button variant="ghost" disabled={busy} onClick={()=>setDestination(null)}>Cancel destination</Button></div>
      </section>}
      {cursor&&<Button variant="outline" disabled={busy} onClick={()=>void load(cursor)}>Load older items</Button>}
      {!tree.permissions.organize&&<p>Restoration also requires permission to organize the notebook.</p>}<p className="nb-trash-retention">{retention}</p>
    </DialogContent></Dialog>
  </>;
}
