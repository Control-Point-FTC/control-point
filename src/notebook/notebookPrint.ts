import {DOMSerializer} from '@tiptap/pm/model';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {notebookSchema,validatedNotebookDocument} from './editorSchema';
import {validatedCanvas} from './canvasModel';
import {fileBlob} from './NotebookAttachments';
import {prepareAnnotatedPdf,printAnnotation,type PrintBudget} from './pdfPrint';
import type {NotebookSync} from './NotebookSync';
import type {NotebookPrintLayout,PrintRect} from './printLayout';
import type {NotebookPageData} from './types';

function dataURL(blob:Blob,signal:AbortSignal):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(),cancel=()=>reader.abort();
    const finish=()=>signal.removeEventListener('abort',cancel);
    reader.onload=()=>{finish();resolve(String(reader.result));};reader.onerror=()=>{finish();reject(new Error('Cannot prepare the image for export.'));};
    reader.onabort=()=>{finish();reject(new DOMException('Export cancelled','AbortError'));};
    signal.throwIfAborted();signal.addEventListener('abort',cancel,{once:true});reader.readAsDataURL(blob);
  });
}

/** An explicit local export; all printouts are prepared independently of the viewport. */
export async function prepareNotebookPrint(sync:NotebookSync,page:NotebookPageData,signal:AbortSignal,onProgress:(message:string)=>void,size={width:800,height:600},layout?:NotebookPrintLayout){
  const content=notebookSchema.nodeFromJSON(validatedNotebookDocument(page.content)),canvas=validatedCanvas(page.canvas);
  const article=document.createElement('article');article.className='notebook-sheet';
  const title=document.createElement('h1');title.textContent=page.title;article.append(title);
  const date=document.createElement('p');date.className='print-page-date';date.textContent=`Revision ${page.revision} · ${page.updatedAt}`;article.append(date);
  const stage=document.createElement('div');stage.className='notebook-print-stage';
  const width=Math.max(120,size.width,...canvas.objects.filter(item=>!item.pdfScope).map(item=>item.x+item.width));
  const height=Math.max(600,size.height,...canvas.objects.filter(item=>!item.pdfScope).map(item=>item.y+item.height));
  Object.assign(stage.style,{width:`${width}px`,minHeight:`${height}px`});
  const flow=document.createElement('div');flow.className='nb-prose notebook-print-flow';flow.append(DOMSerializer.fromSchema(notebookSchema).serializeFragment(content.content));stage.append(flow);
  const position=(node:HTMLElement,rect:PrintRect)=>Object.assign(node.style,{position:'absolute',left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,minHeight:`${rect.height}px`,margin:'0'});
  if(layout){
    if(layout.blocks.length!==flow.children.length)throw new Error('The page layout changed. Wait for it to finish updating, then print again.');
    Object.assign(flow.style,{position:'absolute',inset:'0',padding:'0',height:`${height}px`});
    Array.from(flow.children).forEach((node,index)=>position(node as HTMLElement,layout.blocks[index]));
  }
  canvas.objects.filter(item=>!item.pdfScope).forEach((item,index)=>stage.append(printAnnotation(item,height,index,width)));
  article.append(stage);
  const pending=Array.from(article.querySelectorAll<HTMLElement>('figure[data-notebook-file]')).map(node=>({node,depth:0}));
  const budget:PrintBudget={pages:0,pixels:0,sequence:0};let bytes=0,processed=0;
  while(pending.length){
    signal.throwIfAborted();const {node,depth}=pending.shift()!;
    if(++processed>500||depth>10)throw new Error('Nested printouts are too large. Export the PDFs separately.');
    const fileId=Number(node.getAttribute('fileId')),display=node.getAttribute('display')||'chip',name=node.getAttribute('name')||'Attachment';
    const caption=document.createElement('figcaption');caption.textContent=name;node.replaceChildren(caption);
    const measured=layout?.attachments[node.getAttribute('data-id')||''];
    if(measured){
      Object.assign(node.style,{minHeight:`${measured.rect.height}px`,width:`${measured.rect.width}px`,boxSizing:'border-box'});
      if(node.style.position!=='absolute')node.style.position='relative';
      Object.assign(caption.style,{position:'absolute',left:'13px',top:'13px',margin:'0'});
    }
    if(display==='chip')continue;
    onProgress(`Preparing ${name}…`);
    const blob=await fileBlob(sync,fileId,signal);signal.throwIfAborted();bytes+=blob.size;
    if(bytes>100*1024*1024)throw new Error('This page has too much attachment data for one export. Print its PDFs separately.');
    const targetWidth=Math.min(width,Math.max(120,Number(node.getAttribute('width'))||640));
    if(display==='image'){
      if(!['image/png','image/jpeg','image/gif','image/webp'].includes(blob.type))throw new Error(`${name} cannot be rendered as an image.`);
      const image=document.createElement('img');image.alt=name;image.src=await dataURL(blob,signal);image.style.width=`${targetWidth}px`;image.style.maxWidth='100%';
      if(measured){if(!measured.image)throw new Error('Wait for the image preview to load before printing marks over it.');position(image,measured.image);image.style.height=`${measured.image.height}px`;}
      node.append(image);
    }else if(display==='pdf'){
      const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerURL;
      const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),disableAutoFetch:true,disableStream:true});
      const cancel=()=>{void task.destroy().catch(()=>undefined);};signal.addEventListener('abort',cancel,{once:true});
      try{
        const pdf=await task.promise;signal.throwIfAborted();
        const markup=await prepareAnnotatedPdf(pdf,node.getAttribute('data-id')||undefined,canvas.objects,1,pdf.numPages,signal,number=>onProgress(`Preparing ${name}: page ${number} of ${pdf.numPages}…`),budget);
        const printout=document.createElement('div');printout.className='notebook-print-pdf';printout.style.zoom=String(targetWidth/800);printout.innerHTML=markup;node.append(printout);
        if(measured){
          const sheets=Array.from(printout.querySelectorAll<HTMLElement>(':scope > .pdf-sheet'));
          if(sheets.length!==measured.pages.length)throw new Error('Wait for the PDF printout layout to finish loading before printing this page.');
          Object.assign(printout.style,{zoom:'1',position:'absolute',inset:'0'});
          sheets.forEach((sheet,index)=>{const rect=measured.pages[index];Object.assign(sheet.style,{position:'absolute',left:`${rect.x}px`,top:`${rect.y}px`,margin:'0',transform:`scale(${rect.width/800})`,transformOrigin:'0 0',page:'auto',breakAfter:'auto'});});
        }
        for(const child of printout.querySelectorAll<HTMLElement>('figure[data-notebook-file]'))pending.push({node:child,depth:depth+1});
      }finally{signal.removeEventListener('abort',cancel);await task.destroy();}
    }
  }
  signal.throwIfAborted();return article.outerHTML;
}
