import {DOMSerializer} from '@tiptap/pm/model';
import {notebookSchema,validatedNotebookDocument} from './editorSchema';
import {validatedCanvas} from './canvasModel';
import {printAnnotation} from './pdfPrint';
import type {RevisionDocument} from './revisionDiff';

/** Read-only local rendering. History never opens files or external images automatically. */
export function revisionPreview(document:RevisionDocument){
  const host=window.document.createElement('div');
  const prose=window.document.createElement('div');prose.className='nb-prose';
  prose.append(DOMSerializer.fromSchema(notebookSchema).serializeFragment(notebookSchema.nodeFromJSON(validatedNotebookDocument(document.content)).content));host.append(prose);
  const objects=validatedCanvas(document.canvas).objects;
  const scopes=new Set(objects.map(item=>item.pdfScope||'Notebook drawing'));
  for(const scope of scopes){
    const items=objects.filter(item=>(item.pdfScope||'Notebook drawing')===scope);
    const title=window.document.createElement('p');title.textContent=scope==='Notebook drawing'?scope:`PDF annotation surface: ${scope}`;host.append(title);
    const stage=window.document.createElement('div');stage.className='nb-revision-canvas';
    const width=Math.max(800,...items.map(item=>Math.max(0,item.x)+item.width)),height=Math.max(400,...items.map(item=>Math.max(0,item.y)+item.height));
    // Natural coordinates retain moved/resized objects; scroll instead of silently clipping.
    stage.style.width=`${width}px`;stage.style.height=`${height}px`;
    items.forEach((item,index)=>stage.append(printAnnotation(item,height,index,width)));host.append(stage);
  }
  for(const file of host.querySelectorAll('figure[data-notebook-file]')){
    const caption=window.document.createElement('span');caption.textContent=`Attachment: ${file.getAttribute('name')||'File'} · open from the current page`;file.replaceChildren(caption);
  }
  for(const image of host.querySelectorAll('img')){
    const label=window.document.createElement('span');label.textContent=image.alt||'Saved image';image.replaceWith(label);
  }
  // Disable navigation in a historical snapshot and remove all fetching attributes.
  for(const link of host.querySelectorAll('a')){link.removeAttribute('href');link.removeAttribute('target');}
  for(const element of host.querySelectorAll('*'))for(const attribute of [...element.attributes])if(/^on/i.test(attribute.name)||['src','srcset','poster'].includes(attribute.name))element.removeAttribute(attribute.name);
  return host.innerHTML;
}
