import type { PDFDocumentProxy } from 'pdfjs-dist';
import { DOMSerializer } from '@tiptap/pm/model';
import { notebookSchema, validatedNotebookDocument } from './editorSchema';
import { inkPath } from './canvasGeometry';
import type { CanvasItem } from './canvasModel';

const SVG='http://www.w3.org/2000/svg';
function svgNode(name:string,attrs:Record<string,string|number>){
  const node=document.createElementNS(SVG,name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}
function annotation(item:CanvasItem,height:number,index:number){
  if(item.type==='text'){
    const box=document.createElement('div');box.className='annotation-text';
    Object.assign(box.style,{left:`${item.x}px`,top:`${item.y}px`,width:`${item.width}px`,minHeight:`${item.height}px`,transform:`rotate(${item.rotation}deg)`,zIndex:String(index+2)});
    const content=notebookSchema.nodeFromJSON(validatedNotebookDocument(item.content));
    box.append(DOMSerializer.fromSchema(notebookSchema).serializeFragment(content.content));
    return box;
  }
  const svg=svgNode('svg',{width:800,height,viewBox:`0 0 800 ${height}`});
  Object.assign(svg.style,{position:'absolute',inset:'0',zIndex:String(item.type==='stroke' && item.tool==='highlighter'?1:index+2)});
  const group=svgNode('g',{transform:`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width/2} ${item.height/2})`});svg.append(group);
  if(item.type==='stroke'){
    const highlighter=item.tool==='highlighter';
    group.append(svgNode('path',{d:inkPath(item),fill:highlighter?'none':item.color,stroke:highlighter?item.color:'none','stroke-width':item.strokeWidth,'stroke-linecap':'round','stroke-linejoin':'round',opacity:item.opacity}));
  }else{
    const attrs={stroke:item.color,fill:item.fill??'none','stroke-width':item.strokeWidth};
    if(item.shape==='rectangle')group.append(svgNode('rect',{width:item.width,height:item.height,...attrs}));
    else if(item.shape==='ellipse')group.append(svgNode('ellipse',{cx:item.width/2,cy:item.height/2,rx:item.width/2,ry:item.height/2,...attrs}));
    else{
      group.append(svgNode('path',{d:`M0 ${item.height/2}L${item.width} ${item.height/2}`,...attrs}));
      if(item.shape==='arrow')group.append(svgNode('path',{d:`M${item.width-12} ${item.height/2-6}L${item.width} ${item.height/2}L${item.width-12} ${item.height/2+6}`,stroke:item.color,fill:'none','stroke-width':item.strokeWidth}));
    }
  }
  return svg;
}

/** Explicit, sequential preparation; viewport state never determines what prints. */
export async function prepareAnnotatedPdf(pdf:PDFDocumentProxy,blockId:string|undefined,items:CanvasItem[],first:number,last:number,signal:AbortSignal,onProgress:(page:number)=>void){
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last>pdf.numPages)throw new Error('Choose a valid PDF page range.');
  if(last-first+1>50)throw new Error('Print up to 50 PDF pages at a time. Choose a smaller range.');
  const body=document.createElement('main');let pixels=0;
  for(let number=first;number<=last;number++){
    signal.throwIfAborted();const page=await pdf.getPage(number);
    try{
      const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:1200/base.width});
      const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
      pixels+=width*height;
      if(pixels>80_000_000||height>16000)throw new Error('This printout is too large. Choose a smaller page range.');
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw new Error('PDF printing is unavailable in this browser.');
      const task=page.render({canvas,canvasContext:context,viewport});
      const cancel=()=>task.cancel();signal.addEventListener('abort',cancel,{once:true});
      try{await task.promise;signal.throwIfAborted();}finally{signal.removeEventListener('abort',cancel);}
      const section=document.createElement('section');section.className='pdf-sheet';section.setAttribute('aria-label',`PDF page ${number}`);
      const logicalHeight=800*base.height/base.width;
      const pageName=`nbpdf${number}`;
      Object.assign(section.style,{width:'800px',height:`${logicalHeight}px`,page:pageName});
      const pageStyle=document.createElement('style');pageStyle.textContent=`@page ${pageName}{size:800px ${logicalHeight}px;margin:0}`;section.append(pageStyle);
      const image=document.createElement('img');image.src=canvas.toDataURL('image/png');image.alt=`PDF page ${number}`;section.append(image);
      canvas.width=0;canvas.height=0;
      items.filter(item=>blockId && item.pdfScope===`${blockId}-pdf-${number}`).forEach((item,index)=>section.append(annotation(item,logicalHeight,index)));
      body.append(section);onProgress(number);
    }finally{page.cleanup();}
  }
  return body.innerHTML;
}

/** A separate sandboxed print preview excludes app controls and unsaved draft ink. */
export function showAnnotatedPdfPrint(markup:string){
  const host=document.createElement('dialog');host.className='nb-pdf-print-dialog';host.setAttribute('aria-label','Annotated PDF print preview');
  const toolbar=document.createElement('div');toolbar.className='nb-pdf-print-toolbar';
  const print=document.createElement('button'),close=document.createElement('button'),status=document.createElement('span');
  print.textContent='Print / Save as PDF';print.disabled=true;close.textContent='Close preview';status.textContent='Loading print preview…';
  toolbar.append(print,close,status);
  const frame=document.createElement('iframe');frame.title='Annotated PDF pages';frame.setAttribute('sandbox','allow-same-origin allow-modals');
  frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
    *{box-sizing:border-box}body{margin:0;background:#dce4e8;font-family:system-ui,sans-serif;color:#111}.pdf-sheet{position:relative;background:white;overflow:hidden;margin:20px auto;break-after:page;isolation:isolate}.pdf-sheet:last-child{break-after:auto}.pdf-sheet>img{position:absolute;inset:0;width:100%;height:100%;z-index:0}.annotation-text{position:absolute;padding:8px;font-size:16px;overflow-wrap:anywhere}.annotation-text p{margin:0 0 12px}.annotation-text table{border-collapse:collapse;width:100%}.annotation-text td,.annotation-text th{border:1px solid #888;padding:5px}.annotation-text pre{white-space:pre-wrap}a{color:inherit}input{appearance:none}input[type=checkbox]{width:12px;height:12px;border:1px solid #666}input:checked::after{content:'✓'}@page{margin:0;size:800px 1132px}@media print{body{background:white}.pdf-sheet{margin:0}}
    </style></head><body>${markup}</body></html>`;
  host.append(toolbar,frame);document.body.append(host);
  const remove=()=>{if(host.open)host.close();host.remove();};close.onclick=remove;host.oncancel=event=>{event.preventDefault();remove();};
  frame.onload=async()=>{
    const doc=frame.contentDocument;if(!doc)return;
    try{await Promise.all(Array.from(doc.images).map(image=>image.decode()));await doc.fonts?.ready;print.disabled=false;status.textContent='Choose Save as PDF in the print dialog to export annotations.';}
    catch{status.textContent='Some pages could not load. Close this preview and retry.';}
  };
  print.onclick=()=>{frame.contentWindow?.focus();frame.contentWindow?.print();};host.showModal();
  return remove;
}
