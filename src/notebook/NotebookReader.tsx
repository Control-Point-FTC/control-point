import React, {useEffect, useState} from 'react';
import {yDocToProsemirrorJSON} from '@tiptap/y-tiptap';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from '../components/ui-kit';
import {notebookSchema, validatedNotebookDocument} from './editorSchema';
import {canvasJSON} from './canvasModel';
import type {NotebookSync} from './NotebookSync';
import './reader.css';
import {NotebookReadAloud} from './NotebookReadAloud';

type ReadingBlock = {text:string; heading:boolean; code:boolean};
/** Typed content only. No attachments, drawing recognition or remote services. */
export function notebookReadingBlocks(sync:NotebookSync):ReadingBlock[] {
  const result:ReadingBlock[]=[];
  const append=(content:unknown)=>{
    notebookSchema.nodeFromJSON(validatedNotebookDocument(content)).descendants(node=>{
      if(node.isTextblock) {result.push({text:node.textBetween(0,node.content.size,'\n'),heading:node.type.name==='heading',code:node.type.name==='codeBlock'});return false;}
      if(node.type.name==='notebookFile') {result.push({text:`Attachment: ${String(node.attrs.name || 'File')} (open from the page)`,heading:false,code:false});return false;}
    });
  };
  append(yDocToProsemirrorJSON(sync.doc));
  for(const item of canvasJSON(sync.doc).objects) if(item.type==='text') append(item.content);
  return result;
}

export function NotebookReader({sync}:{sync:NotebookSync}) {
  const [open,setOpen]=useState(false),[size,setSize]=useState(20),[spacing,setSpacing]=useState(1.8),[theme,setTheme]=useState('paper');
  const [,redraw]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const update=()=>redraw(n=>n+1);
    sync.doc.on('afterTransaction',update);
    const unsubscribe=sync.subscribe(update);
    return ()=>{sync.doc.off('afterTransaction',update);unsubscribe();};
  },[sync,open]);
  const allowed=!!sync.data && sync.status!=='unavailable';
  let blocks:ReadingBlock[]=[],error='';
  if(open && allowed) try {blocks=notebookReadingBlocks(sync);} catch {error='This page needs a compatible reader. Return to the page to view the original content.';}
  return <Dialog open={open && allowed} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className="nb-tool" disabled={!allowed}>Reading mode</button></DialogTrigger>
    <DialogContent className={`nb-reader nb-reader-${theme}`}>
      <DialogHeader><DialogTitle>{String(sync.doc.getMap('meta').get('title') || 'Untitled page')}</DialogTitle><DialogDescription>Typed text from this page and its text boxes. Changes stay live; reading preferences do not edit the page.</DialogDescription></DialogHeader>
      <div className="nb-reader-controls">
        <label>Text size <select aria-label="Reader text size" value={size} onChange={e=>setSize(Number(e.target.value))}>{[16,18,20,24,28,32].map(n=><option key={n} value={n}>{n} px</option>)}</select></label>
        <label>Line spacing <select aria-label="Reader line spacing" value={spacing} onChange={e=>setSpacing(Number(e.target.value))}>{[1.4,1.6,1.8,2,2.2].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Background <select aria-label="Reader background" value={theme} onChange={e=>setTheme(e.target.value)}><option value="paper">Paper</option><option value="warm">Warm</option><option value="dark">Dark</option></select></label>
        <button onClick={()=>{setSize(20);setSpacing(1.8);setTheme('paper');}}>Reset reading preferences</button>
        <button onClick={()=>setOpen(false)}>Return to page</button>
      </div>
      <NotebookReadAloud available={allowed} getText={()=>notebookReadingBlocks(sync).map(block=>block.text).join('\n\n')}/>
      <section aria-label="Page reading content" tabIndex={0} className="nb-reader-content" style={{fontSize:size,lineHeight:spacing}}>
        {error ? <p role="alert">{error}</p> : blocks.length ? blocks.map((block,i)=>block.heading ? <h2 key={i}>{block.text}</h2> : block.code ? <pre key={i}>{block.text}</pre> : <p key={i}>{block.text || '\u00a0'}</p>) : <p>This page has no typed text yet.</p>}
      </section>
    </DialogContent>
  </Dialog>;
}
