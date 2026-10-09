import React,{useEffect,useRef,useState,lazy,Suspense} from 'react';
import type { PDFDocumentProxy,PDFPageProxy,RenderTask } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { NotebookSync } from './NotebookSync';
import { fileBlob,type NotebookFileContext } from './NotebookAttachments';
import { canvasJSON } from './canvasModel';
import { apiJson } from '../services/api';
const NotebookCanvas=lazy(()=>import('./NotebookCanvas'));
/** Rendering is requested by the author. No OCR, text extraction, indexing or AI ingestion. */
export default function NotebookPdf({sync,fileId,width=640,blockId,context}:{sync:NotebookSync;fileId:number;width?:number;blockId?:string;context?:React.ContextType<typeof NotebookFileContext>}){
  const printout=useRef<HTMLDivElement|null>(null),[displayWidth,setDisplayWidth]=useState(Math.min(width,640));
  const latestContext=useRef(context);latestContext.current=context;
  useEffect(()=>()=>{const current=latestContext.current;if(blockId && current?.drawingScope?.startsWith(`${blockId}-pdf-`))current.setDrawingScope(null);},[blockId,sync,fileId]);
  useEffect(()=>{if(!printout.current)return;const resize=()=>setDisplayWidth(printout.current?.clientWidth||Math.min(width,640));resize();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(resize);observer.observe(printout.current);return()=>observer.disconnect();},[width]);
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [first,setFirst]=useState(1),[last,setLast]=useState(1),[printStatus,setPrintStatus]=useState(''),[printing,setPrinting]=useState(false),printAbort=useRef<AbortController|null>(null);
  const closePrintPreview=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{printAbort.current?.abort();closePrintPreview.current?.();closePrintPreview.current=null;},[sync,fileId]);
  const printPdf=async()=>{
    if(!document || printing)return;
    const abort=new AbortController();printAbort.current=abort;setPrinting(true);setPrintStatus('Preparing annotated PDF…');
    try{
      if(sync.pending && !await sync.flush())throw new Error('Save your changes before printing.');
      const {prepareAnnotatedPdf,showAnnotatedPdfPrint}=await import('./pdfPrint');
      const markup=await prepareAnnotatedPdf(document,blockId,canvasJSON(sync.doc).objects,first,last,abort.signal,page=>setPrintStatus(`Prepared page ${page} of ${last}…`));
      // Recheck team/page access after preparation before revealing an export.
      await apiJson(`/api/notebook/pages/${sync.pageId}`,{cache:'no-store',signal:abort.signal,headers:sync.scope?{'X-CP-Notebook-Team':String(sync.scope.teamId)}:undefined});
      abort.signal.throwIfAborted();
      if(['unavailable','conflict','error'].includes(sync.status))throw new Error('Page access changed. Reopen the page before printing.');
      closePrintPreview.current?.();closePrintPreview.current=showAnnotatedPdfPrint(markup);setPrintStatus('Annotated print preview ready.');
    }catch(e){if(!abort.signal.aborted)setPrintStatus((e as Error).message||'Cannot prepare this printout.');}
    finally{if(!abort.signal.aborted)setPrinting(false);}
  };
  useEffect(()=>{
    const abort=new AbortController();let task:any;let stopped=false;
    setDocument(null);setError('');setLoading(true);setPrinting(false);setPrintStatus('');
    void(async()=>{try{
      const [pdfjs,blob]=await Promise.all([import('pdfjs-dist'),fileBlob(sync,fileId,abort.signal)]);
      if(stopped)return;pdfjs.GlobalWorkerOptions.workerSrc=workerURL;
      task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),disableAutoFetch:true,disableStream:true});
      const value=await task.promise;if(stopped){await value.destroy();return;}
      setDocument(value);setFirst(1);setLast(Math.min(value.numPages,50));setLoading(false);
    }catch(e){if(!stopped){setLoading(false);setError((e as Error).message||'Cannot render this PDF. Download its original.');}}})();
    return()=>{stopped=true;abort.abort();void task?.destroy();};
  },[sync,fileId]);
  return <div ref={printout} className="nb-pdf-printout" style={{width:Math.min(1600,width),maxWidth:'100%'}}>
    {loading && <p role="status">Loading PDF printout…</p>}{error && <p role="alert">{error}</p>}
    {document && <><p className="nb-pdf-count">{document.numPages.toLocaleString()} PDF pages</p>{context && !context.mobile && <div className="nb-pdf-print-controls"><label>From <input aria-label="First PDF page to print" type="number" min="1" max={document.numPages} value={first} disabled={printing} onChange={e=>setFirst(Number(e.target.value))}/></label><label>To <input aria-label="Last PDF page to print" type="number" min="1" max={document.numPages} value={last} disabled={printing} onChange={e=>setLast(Number(e.target.value))}/></label><button disabled={printing} onClick={printPdf}>Print annotated PDF</button>{printing && <button onClick={()=>{printAbort.current?.abort();setPrinting(false);setPrintStatus('Print preparation cancelled.');}}>Cancel preparation</button>}{printStatus && <span role="status">{printStatus}</span>}</div>}{Array.from({length:Math.min(document.numPages,1000)},(_,i)=><PdfPage key={i} document={document} number={i+1} width={displayWidth} scopeId={blockId?`${blockId}-pdf-${i+1}`:undefined} context={context}/>)}{document.numPages>1000 && <p role="status">The first 1,000 pages are shown. Download the untouched original for the full document.</p>}</>}
  </div>;
}
function PdfPage({document,number,width,scopeId,context}:{document:PDFDocumentProxy;number:number;width:number;scopeId?:string;context?:React.ContextType<typeof NotebookFileContext>}){
  const host=useRef<HTMLElement|null>(null),[canvasElement,setCanvasElement]=useState<HTMLCanvasElement|null>(null),[visible,setVisible]=useState(false),[ratio,setRatio]=useState(1.414),[error,setError]=useState(''),[ready,setReady]=useState(false);
  // Keep the selected page mounted when it scrolls away so its ribbon and undo
  // actions still target a live canvas. Other pages remain viewport-lazy.
  const selected=!!scopeId && context?.drawingScope===scopeId;
  const mounted=visible || selected;
  useEffect(()=>{
    if(!host.current)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'900px'});observer.observe(host.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!mounted || !canvasElement)return;let stopped=false,task:RenderTask|undefined,page:PDFPageProxy|undefined;
    setReady(false);setError('');
    void(async()=>{try{
      page=await document.getPage(number);if(stopped)return;
      const base=page.getViewport({scale:1});setRatio(base.height/base.width);
      const pixelRatio=Math.min(2,window.devicePixelRatio||1),viewport=page.getViewport({scale:800/base.width*pixelRatio});
      const target=canvasElement;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
      const context=target.getContext('2d');if(!context)throw new Error('PDF rendering is unavailable in this browser.');
      task=page.render({canvas:target,canvasContext:context,viewport});await task.promise;if(!stopped)setReady(true);
    }catch(e){if(!stopped)setError((e as Error).message||'This PDF page could not be rendered.');}})();
    return()=>{stopped=true;task?.cancel();void task?.promise.catch(()=>undefined).then(()=>page?.cleanup());};
  },[mounted,document,number,canvasElement]);
  const rendered=<><canvas ref={setCanvasElement} style={{width:'100%',height:'100%',display:mounted?'block':'none'}} aria-label={`Rendered PDF page ${number}`}/>{!ready && !error && <span role="status">{mounted?'Rendering page…':'Page loads as you scroll'}</span>}{error && <p role="alert">{error}</p>}</>;
  return <section ref={host} className={`nb-pdf-page ${selected?'is-annotating':''}`} aria-label={`PDF page ${number}`}><header>Page {number}{scopeId && context && !context.mobile && context.editable && <button onClick={()=>context.setDrawingScope(selected?null:scopeId)}>{selected?'Finish annotation':'Annotate page'}</button>}</header><div style={{aspectRatio:`1 / ${ratio}`,overflow:'hidden'}}>
    {mounted && scopeId && context?<div style={{width:800,zoom:Math.min(1600,width)/800}}><Suspense fallback={rendered}><NotebookCanvas sync={context.sync} scopeId={scopeId} active={selected} editable={selected && context.editable} mobile={context.mobile} onActivate={()=>{if(context.editable && !context.mobile)context.setDrawingScope(scopeId);}} onRibbon={context.onRibbon} onEditorFocus={context.onEditorFocus} onEditorRemoved={context.onEditorRemoved} onSelectionChange={context.onSelectionChange}><div style={{width:800,height:800*ratio}}>{rendered}</div></NotebookCanvas></Suspense></div>:rendered}
  </div></section>;
}
