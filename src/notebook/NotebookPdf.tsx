import React,{useEffect,useRef,useState} from 'react';
import type { PDFDocumentProxy,PDFPageProxy,RenderTask } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { NotebookSync } from './NotebookSync';
import { fileBlob } from './NotebookAttachments';
/** Rendering is requested by the author. No OCR, text extraction, indexing or AI ingestion. */
export default function NotebookPdf({sync,fileId,width=640}:{sync:NotebookSync;fileId:number;width?:number}){
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const abort=new AbortController();let task:any;let stopped=false;
    setDocument(null);setError('');setLoading(true);
    void(async()=>{try{
      const [pdfjs,blob]=await Promise.all([import('pdfjs-dist'),fileBlob(sync,fileId,abort.signal)]);
      if(stopped)return;pdfjs.GlobalWorkerOptions.workerSrc=workerURL;
      task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),disableAutoFetch:true,disableStream:true});
      const value=await task.promise;if(stopped){await value.destroy();return;}
      setDocument(value);setLoading(false);
    }catch(e){if(!stopped){setLoading(false);setError((e as Error).message||'Cannot render this PDF. Download its original.');}}})();
    return()=>{stopped=true;abort.abort();void task?.destroy();};
  },[sync,fileId]);
  return <div className="nb-pdf-printout" style={{width:Math.min(1600,width),maxWidth:'100%'}}>
    {loading && <p role="status">Loading PDF printout…</p>}{error && <p role="alert">{error}</p>}
    {document && <><p className="nb-pdf-count">{document.numPages.toLocaleString()} PDF pages</p>{Array.from({length:Math.min(document.numPages,1000)},(_,i)=><PdfPage key={i} document={document} number={i+1}/>)}{document.numPages>1000 && <p role="status">The first 1,000 pages are shown. Download the untouched original for the full document.</p>}</>}
  </div>;
}
function PdfPage({document,number}:{document:PDFDocumentProxy;number:number}){
  const host=useRef<HTMLElement|null>(null),canvas=useRef<HTMLCanvasElement|null>(null),[visible,setVisible]=useState(false),[ratio,setRatio]=useState(1.414),[error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{
    if(!host.current)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'900px'});observer.observe(host.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible || !canvas.current)return;let stopped=false,task:RenderTask|undefined,page:PDFPageProxy|undefined;
    setReady(false);setError('');
    void(async()=>{try{
      page=await document.getPage(number);if(stopped)return;
      const base=page.getViewport({scale:1});setRatio(base.height/base.width);
      const pixelRatio=Math.min(2,window.devicePixelRatio||1),viewport=page.getViewport({scale:800/base.width*pixelRatio});
      const target=canvas.current!;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
      const context=target.getContext('2d');if(!context)throw new Error('PDF rendering is unavailable in this browser.');
      task=page.render({canvas:target,canvasContext:context,viewport});await task.promise;if(!stopped)setReady(true);
    }catch(e){if(!stopped)setError((e as Error).message||'This PDF page could not be rendered.');}})();
    return()=>{stopped=true;task?.cancel();void task?.promise.catch(()=>undefined).then(()=>page?.cleanup());};
  },[visible,document,number]);
  return <section ref={host} className="nb-pdf-page" aria-label={`PDF page ${number}`}><header>Page {number}</header><div style={{aspectRatio:`1 / ${ratio}`}}><canvas ref={canvas} style={{width:'100%',height:'100%',display:visible?'block':'none'}} aria-label={`Rendered PDF page ${number}`}/>{!ready && !error && <span role="status">{visible?'Rendering page…':'Page loads as you scroll'}</span>}{error && <p role="alert">{error}</p>}</div></section>;
}
