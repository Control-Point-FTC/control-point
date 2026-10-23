import React,{useEffect,useRef,useState} from 'react';
import type { Editor } from '@tiptap/react';
import { DOMSerializer, Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Loader2 } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui-kit';
import { apiJson } from '../services/api';
import { notify } from '../components/dialog';
import type { NotebookSync } from './NotebookSync';
import { RibbonButton } from './ribbon/RibbonParts';
import { notebookCommandGlyph } from './NotebookIcons';

const PolishGlyph=notebookCommandGlyph('Polish');

/** Stands in for a picture, table or file the polish kept (server/notebookPolish.ts). */
export const POLISH_KEEP='polishKeep';
export type Polished={pageId:number;revision:number;blocks:string[];content:any[];dropped:string[];added:string[]};

/** Ids of the top-level blocks a selection touches, or null for no selection (the whole page). */
export function selectedTopBlocks(editor:Editor):string[]|null{
  const {from,to,empty}=editor.state.selection;if(empty)return null;
  const doc=editor.state.doc,first=doc.resolve(from).index(0),last=doc.resolve(Math.max(from,to-1)).index(0),ids:string[]=[];
  for(let i=first;i<=last&&i<doc.childCount;i++){const id=doc.child(i).attrs.id;if(typeof id!=='string')return null;ids.push(id);}
  return ids.length?ids:null;
}
const topIds=(editor:Editor)=>{const ids:string[]=[];editor.state.doc.forEach(node=>{ids.push(String(node.attrs.id??''));});return ids;};
/** Where the run of `ids` sits now, if it is still there, together and in order. */
function locate(editor:Editor,ids:string[]){
  const found:{node:PMNode;pos:number}[]=[];editor.state.doc.forEach((node,pos)=>{if(ids.includes(node.attrs.id))found.push({node,pos});});
  if(found.length!==ids.length||found.some((f,i)=>f.node.attrs.id!==ids[i]))return null;
  const last=found[found.length-1];
  if(last.pos+last.node.nodeSize-found[0].pos!==found.reduce((n,f)=>n+f.node.nodeSize,0))return null;
  return {from:found[0].pos,to:last.pos+last.node.nodeSize,nodes:found.map(f=>f.node)};
}
/** The polished blocks as nodes, every kept block taken from the page as it is. */
export function polishedNodes(editor:Editor,content:any[],originals:PMNode[]):PMNode[]{
  const byId=new Map(originals.map(n=>[n.attrs.id,n]));
  return content.map(json=>{
    if(json?.type!==POLISH_KEEP)return editor.schema.nodeFromJSON(json);
    const kept=byId.get(json.attrs?.id);if(!kept)throw new Error('A kept block is missing.');return kept;
  });
}
const snapshotOf=(nodes:PMNode[])=>JSON.stringify(nodes.map(n=>n.toJSON()));
/** Replaces the polished blocks in one transaction (one undo step). Returns why it couldn't, or null. */
export function applyPolish(editor:Editor,result:Polished,snapshot:string):string|null{
  const range=locate(editor,result.blocks);
  if(!range||snapshotOf(range.nodes)!==snapshot)return 'The page changed while Bruno worked. Polish again to include the latest edits.';
  let nodes:PMNode[];
  try{nodes=polishedNodes(editor,result.content,range.nodes);}catch{return 'Bruno’s version couldn’t be placed on this page. Polish again.';}
  editor.view.dispatch(editor.state.tr.replaceWith(range.from,range.to,Fragment.fromArray(nodes)).scrollIntoView());
  editor.commands.focus();
  return null;
}

function Preview({editor,nodes,label}:{editor:Editor;nodes:PMNode[];label:string}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=host.current;if(!el)return;el.replaceChildren(DOMSerializer.fromSchema(editor.schema).serializeFragment(Fragment.fromArray(nodes)));},[editor,nodes]);
  return <div ref={host} className="nb-prose nb-polish-preview" role="region" aria-label={label} tabIndex={0}/>;
}

/** The ribbon's "Polish with Bruno": rough notes become headings, lists and checklists, previewed before anything changes. */
/** `variant="bar"`: the labelled button in the page bar (the ribbon's compact rows drop labels). */
export function NotebookPolish({sync,editor,disabled,variant='ribbon'}:{sync:NotebookSync;editor:Editor|null;disabled:boolean;variant?:'ribbon'|'bar'}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Polished|null>(null);
  const [view,setView]=useState<'after'|'before'>('after'),[scope,setScope]=useState<'page'|'selection'>('page');
  const snapshot=useRef(''),originals=useRef<PMNode[]>([]),abort=useRef<AbortController|null>(null),selection=useRef<string[]|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  const excluded=!!sync.data?.protected;
  const run=async()=>{
    if(!editor||editor.isDestroyed)return;
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    setBusy(true);setError('');setResult(null);setView('after');
    try{
      if(sync.pending&&!await sync.flush())throw new Error('Save your changes first, then polish.');
      const ids=selection.current??topIds(editor),range=locate(editor,ids);
      if(!range)throw new Error('The page changed. Polish again.');
      snapshot.current=snapshotOf(range.nodes);originals.current=range.nodes;
      const headers=sync.scope?{'X-CP-Notebook-Team':String(sync.scope.teamId),'Content-Type':'application/json'}:{'Content-Type':'application/json'};
      const polished=await apiJson<Polished>(`/api/notebook/pages/${sync.pageId}/polish`,{method:'POST',headers,signal:controller.signal,body:JSON.stringify({revision:sync.data?.revision,...(selection.current?{blocks:selection.current}:{})})});
      if(controller.signal.aborted)return;
      if(polished.blocks.join(',')!==ids.join(','))throw new Error('The page changed while Bruno worked. Polish again.');
      setResult(polished);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Bruno couldn’t polish this page just now.');}
    finally{if(abort.current===controller)setBusy(false);}
  };
  const start=()=>{if(!editor)return;selection.current=selectedTopBlocks(editor);setScope(selection.current?'selection':'page');setOpen(true);void run();};
  const close=()=>{abort.current?.abort();setOpen(false);setBusy(false);setResult(null);setError('');};
  const apply=()=>{
    if(!editor||!result)return;
    const problem=applyPolish(editor,result,snapshot.current);
    if(problem){setError(problem);setResult(null);return;}
    close();notify('Page polished. Undo with Ctrl+Z.','success');
  };
  let after:PMNode[]=[];
  if(editor&&result){try{after=polishedNodes(editor,result.content,originals.current);}catch{after=[];}}
  return <>
    {variant==='bar'
      ?<button type="button" className="nb-bar-btn" aria-label="Polish with Bruno" title={excluded?'Bruno can’t read admin-only pages':'Polish with Bruno: turn rough notes into headings, lists and checklists'} disabled={disabled||excluded||!editor} onMouseDown={e=>e.preventDefault()} onClick={start}>{PolishGlyph&&<PolishGlyph size={16}/>}<span>Polish</span></button>
      :<RibbonButton label="Polish with Bruno" icon="Polish" showLabel disabled={disabled||excluded||!editor} onClick={start}/>}
    <Dialog open={open} onOpenChange={next=>{if(!next)close();}}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Polish with Bruno</DialogTitle>
          <DialogDescription>{scope==='selection'?'The selected part':'This page'}: Bruno sorts your notes into headings, lists, checklists and small tables. Pictures, tables and files stay where they are, and nothing is added that isn’t in your notes. Nothing changes until you apply.</DialogDescription>
        </DialogHeader>
        {busy&&<p role="status" className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Bruno is reading your notes…</p>}
        {error&&!busy&&<p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm">{error}</p>}
        {result&&editor&&!busy&&<>
          <div role="tablist" aria-label="Compare" className="flex gap-1 text-sm">
            {(['after','before'] as const).map(v=><button key={v} type="button" role="tab" aria-selected={view===v} className={`rounded-md px-3 py-1 ${view===v?'bg-accent/15 font-medium':'text-muted-foreground'}`} onClick={()=>setView(v)}>{v==='after'?'Polished':'Original'}</button>)}
          </div>
          <Preview editor={editor} nodes={view==='after'?after:originals.current} label={view==='after'?'Polished version':'Original version'}/>
          {result.dropped.length>0&&<p role="alert" className="rounded-md bg-warning/10 px-3 py-2 text-sm">Not found in Bruno’s version: <strong>{result.dropped.join(', ')}</strong>. Check the Original tab before applying.</p>}
          {result.added.length>0&&<p className="text-xs text-muted-foreground">New words (usually headings): {result.added.join(', ')}</p>}
        </>}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {!busy&&(error||result)&&<Button variant="outline" onClick={()=>{void run();}}>Try again</Button>}
          {result&&!busy&&<Button onClick={apply}>{result.dropped.length?'Apply anyway':'Apply'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
