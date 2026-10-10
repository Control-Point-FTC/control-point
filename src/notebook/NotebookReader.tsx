import React, {useEffect, useState} from 'react';
import {yDocToProsemirrorJSON,yXmlFragmentToProsemirrorJSON} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from '../components/ui-kit';
import {notebookSchema, validatedNotebookDocument} from './editorSchema';
import type {NotebookSync} from './NotebookSync';
import './reader.css';
import {NotebookReadAloud} from './NotebookReadAloud';

type ReadingBlock = {text:string; heading:boolean; code:boolean};
export type ReaderPreferences={size:number;spacing:number;theme:'paper'|'warm'|'dark'};
export const DEFAULT_READER_PREFERENCES:ReaderPreferences={size:20,spacing:1.8,theme:'paper'};
export function useNotebookReaderPreferences(key?:string):[ReaderPreferences,(value:ReaderPreferences)=>void]{
  const read=()=>{try{const value=JSON.parse(key?localStorage.getItem(key)||'null':'null');if(value&&[16,18,20,24,28,32].includes(value.size)&&[1.4,1.6,1.8,2,2.2].includes(value.spacing)&&['paper','warm','dark'].includes(value.theme))return value as ReaderPreferences;}catch{/* Optional device preferences. */}return DEFAULT_READER_PREFERENCES;};
  const [value,setValue]=useState<ReaderPreferences>(read);
  useEffect(()=>setValue(read()),[key]);
  return [value,next=>{setValue(next);try{if(key)localStorage.setItem(key,JSON.stringify(next));}catch{/* State lives above the ribbon even when storage is blocked. */}}];
}
/** Typed content only. No attachments, drawing recognition or remote services. */
export function notebookReadingBlocks(sync:NotebookSync):ReadingBlock[] {
  const result:ReadingBlock[]=[];
  const append=(content:unknown)=>{
    notebookSchema.nodeFromJSON(validatedNotebookDocument(content)).descendants(node=>{
      if(node.isTextblock) {result.push({text:node.textBetween(0,node.content.size,'\n',leaf=>leaf.type.name==='hardBreak'?'\n':''),heading:node.type.name==='heading',code:node.type.name==='codeBlock'});return false;}
      if(node.type.name==='notebookFile') {result.push({text:`Attachment: ${String(node.attrs.name || 'File')} (open from the page)`,heading:false,code:false});return false;}
    });
  };
  append(yDocToProsemirrorJSON(sync.doc));
  for(const item of sync.doc.getMap('canvas').values()) if(item instanceof Y.Map && item.get('type')==='text') {
    const fragment=item.get('content');if(!(fragment instanceof Y.XmlFragment))throw new Error('Unsupported text box');
    append(yXmlFragmentToProsemirrorJSON(fragment));
  }
  return result;
}

export function NotebookReader({sync,preferences,onPreferencesChange}:{sync:NotebookSync;preferences?:ReaderPreferences;onPreferencesChange?:(value:ReaderPreferences)=>void}) {
  const [open,setOpen]=useState(false),[fallback,setFallback]=useState(DEFAULT_READER_PREFERENCES);
  const {size,spacing,theme}=preferences??fallback;
  const change=(value:Partial<ReaderPreferences>)=>(onPreferencesChange??setFallback)({...preferences??fallback,...value});
  const [reading,setReading]=useState<{blocks:ReadingBlock[];error:string}>({blocks:[],error:''});
  const [,redraw]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const prose=sync.doc.getXmlFragment('prosemirror'),canvas=sync.doc.getMap('canvas'),meta=sync.doc.getMap('meta');
    const currentTextIds=()=>new Set([...canvas].filter(([,item])=>item instanceof Y.Map && item.get('type')==='text').map(([id])=>id));
    let textIds=currentTextIds();
    const update=()=>{try{setReading({blocks:notebookReadingBlocks(sync),error:''});}catch{setReading({blocks:[],error:'This page needs a compatible reader. Return to the page to view the original content.'});}textIds=currentTextIds();};
    const updateCanvas=(events:Y.YEvent<any>[])=>{
      if(events.some(event=>{
        if(event.target===canvas)return [...event.changes.keys].some(([id])=>{const current=canvas.get(id);return textIds.has(id)||current instanceof Y.Map && current.get('type')==='text';});
        const id=String(event.path[0]),item=canvas.get(id);
        if(!textIds.has(id) && !(item instanceof Y.Map && item.get('type')==='text'))return false;
        return event.path.length===1 && event.target instanceof Y.Map ? event.changes.keys.has('type')||event.changes.keys.has('content') : event.path[1]==='content';
      }))update();
    };
    const status=()=>redraw(n=>n+1);update();prose.observeDeep(update);canvas.observeDeep(updateCanvas);meta.observe(status);
    const unsubscribe=sync.subscribe(status);
    return ()=>{prose.unobserveDeep(update);canvas.unobserveDeep(updateCanvas);meta.unobserve(status);unsubscribe();};
  },[sync,open]);
  const allowed=!!sync.data && sync.status!=='unavailable';
  const {blocks,error}=reading;
  return <Dialog open={open && allowed} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className="nb-tool" disabled={!allowed}>Reading mode</button></DialogTrigger>
    <DialogContent className={`nb-reader nb-reader-${theme}`}>
      <DialogHeader><DialogTitle style={{color:'inherit'}}>{String(sync.doc.getMap('meta').get('title') || 'Untitled page')}</DialogTitle><DialogDescription style={{color:'inherit',opacity:.8}}>Typed text from this page and its text boxes. Changes stay live; reading preferences do not edit the page.</DialogDescription></DialogHeader>
      <div className="nb-reader-controls">
        <label>Text size <select aria-label="Reader text size" value={size} onChange={e=>change({size:Number(e.target.value)})}>{[16,18,20,24,28,32].map(n=><option key={n} value={n}>{n} px</option>)}</select></label>
        <label>Line spacing <select aria-label="Reader line spacing" value={spacing} onChange={e=>change({spacing:Number(e.target.value)})}>{[1.4,1.6,1.8,2,2.2].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Background <select aria-label="Reader background" value={theme} onChange={e=>change({theme:e.target.value as ReaderPreferences['theme']})}><option value="paper">Paper</option><option value="warm">Warm</option><option value="dark">Dark</option></select></label>
        <button onClick={()=>change(DEFAULT_READER_PREFERENCES)}>Reset reading preferences</button>
        <button onClick={()=>setOpen(false)}>Return to page</button>
      </div>
      <NotebookReadAloud available={allowed} getText={()=>notebookReadingBlocks(sync).map(block=>block.text).join('\n\n')}/>
      <section aria-label="Page reading content" tabIndex={0} className="nb-reader-content" style={{fontSize:size,lineHeight:spacing}}>
        {error ? <p role="alert">{error}</p> : blocks.length ? blocks.map((block,i)=>block.heading ? <h2 key={i}>{block.text}</h2> : block.code ? <pre key={i}>{block.text}</pre> : <p key={i}>{block.text || '\u00a0'}</p>) : <p>This page has no typed text yet.</p>}
      </section>
    </DialogContent>
  </Dialog>;
}
