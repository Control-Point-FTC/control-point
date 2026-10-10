import React,{useEffect,useRef,useState} from 'react';
import {Button,Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,Input,Label} from '../components/ui-kit';
import {apiJson} from '../services/api';
import type {NotebookTree} from './types';

export function quickNoteDocument(text:string) {
  return {type:'doc',content:text.replace(/\r\n?/g,'\n').split('\n').map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}))};
}

/** A team-scoped, in-memory capture draft; never journal protected text. */
export function NotebookQuickNote({tree,teamId,sectionId,onSaved,onOpen}:{tree:NotebookTree;teamId:number;sectionId:number|null;onSaved:()=>void;onOpen:(id:number)=>void}) {
  const [open,setOpen]=useState(false),[destination,setDestination]=useState(''),[title,setTitle]=useState(''),[text,setText]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<number|null>(null);
  const claimed=useRef(false),mounted=useRef(true),abort=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;abort.current?.abort();};},[]);
  useEffect(()=>{
    if(!tree.permissions.edit||(destination&&!tree.sections.some(s=>String(s.id)===destination))){
      abort.current?.abort();setText('');setTitle('');setDestination('');setError('The destination is no longer available. The capture draft was cleared.');
    }
  },[tree,destination]);
  const show=()=>{setDestination(value=>tree.sections.some(s=>String(s.id)===value)?value:String(sectionId??tree.sections[0]?.id??''));setOpen(true);};
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(claimed.current||!text.trim()||!destination)return;
    claimed.current=true;setBusy(true);setError('');
    const controller=new AbortController();abort.current=controller;
    const headers={'X-CP-Notebook-Team':String(teamId)};
    try{
      const fresh=await apiJson<NotebookTree>('/api/notebook/tree',{headers,cache:'no-store',signal:controller.signal});
      if(!fresh.permissions.edit||!fresh.sections.some(s=>String(s.id)===destination))throw new Error('You can no longer save to this section. Choose an available section after refreshing.');
      const result=await apiJson<{id:number}>('/api/notebook/pages',{method:'POST',headers,signal:controller.signal,body:JSON.stringify({title:title.trim()||'Quick note',sectionId:Number(destination),parentId:null,content:quickNoteDocument(text)})});
      if(!mounted.current)return;
      setSaved(result.id);setTitle('');setText('');setOpen(false);onSaved();
    }catch(e){if(mounted.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not save the note.');}
    finally{claimed.current=false;if(mounted.current)setBusy(false);}
  };
  return <>
    <Button variant="ghost" onClick={show} disabled={!tree.permissions.edit||!tree.sections.length}>Quick note</Button>
    {saved!=null&&<span role="status">Quick note saved. <button className="nb-tool" onClick={()=>{onOpen(saved);setSaved(null);}}>Open saved note</button></span>}
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent><DialogHeader><DialogTitle>Quick team note</DialogTitle><DialogDescription>Capture a thought without leaving your current page. It becomes an editable page in the section you choose.</DialogDescription></DialogHeader>
      <form className="nb-form" onSubmit={submit}>
        <Label htmlFor="nb-quick-section">Save to section</Label><select id="nb-quick-section" value={destination} disabled={busy} required onChange={e=>setDestination(e.target.value)}>{tree.sections.map(s=><option key={s.id} value={s.id}>{tree.notebooks.find(n=>n.id===s.notebookId)?.title} / {s.title}{s.protected?' · Admin only':''}</option>)}</select>
        <p className="nb-small">{tree.sections.find(s=>String(s.id)===destination)?.protected?'Only team admins can access this note.':'Everyone with notebook access on your team can read this note.'}</p>
        <Label htmlFor="nb-quick-title">Title (optional)</Label><Input id="nb-quick-title" value={title} maxLength={200} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="Quick note"/>
        <Label htmlFor="nb-quick-text">Note</Label><textarea id="nb-quick-text" autoFocus rows={7} maxLength={20000} value={text} disabled={busy} required onChange={e=>setText(e.target.value)}/>
        <p className="nb-small">Drafts stay in memory while this workspace is open. Closing this dialog keeps your draft; switching workspaces or closing the app clears it.</p>
        {error&&<p role="alert">{error} Your draft is retained. If the connection failed while saving, check the section for the note before trying again.</p>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Close draft</Button><Button type="submit" disabled={busy||!text.trim()||!destination||!tree.permissions.edit}>{busy?'Saving…':'Save note'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}
