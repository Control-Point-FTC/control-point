import {DOMSerializer} from '@tiptap/pm/model';
import {notebookSchema,validatedNotebookDocument} from './editorSchema';
import {validatedCanvas} from './canvasModel';
import {printAnnotation} from './pdfPrint';
import type {RevisionDocument} from './revisionDiff';

/** Read-only local rendering. History never opens files or external images automatically. */
export function revisionPreview(document:RevisionDocument,attachmentHint='open from the current page'){
  const host=window.document.createElement('div');
  const prose=window.document.createElement('div');prose.className='nb-prose';
  prose.append(DOMSerializer.fromSchema(notebookSchema).serializeFragment(notebookSchema.nodeFromJSON(validatedNotebookDocument(document.content)).content));host.append(prose);
  const objects=validatedCanvas(document.canvas).objects;
  const scopes=new Set(objects.map(item=>item.pdfScope||'Notebook drawing'));
  for(const scope of scopes){
    const items=objects.filter(item=>(item.pdfScope||'Notebook drawing')===scope);
    const title=window.document.createElement('p');title.textContent=scope==='Notebook drawing'?scope:`PDF annotation surface: ${scope}`;host.append(title);
    const stage=window.document.createElement('div');stage.className='nb-revision-canvas';
    const bounds=items.map(item=>{
      const angle=item.rotation*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
      const padding=item.type==='text'?1:item.strokeWidth+12;
      const halfWidth=(item.width*c+item.height*s)/2+padding,halfHeight=(item.width*s+item.height*c)/2+padding;
      const cx=item.x+item.width/2,cy=item.y+item.height/2;
      return {left:cx-halfWidth,top:cy-halfHeight,right:cx+halfWidth,bottom:cy+halfHeight};
    });
    const left=Math.min(0,...bounds.map(rect=>rect.left)),top=Math.min(0,...bounds.map(rect=>rect.top));
    const width=Math.ceil(Math.max(800,...bounds.map(rect=>rect.right))-left),height=Math.ceil(Math.max(400,...bounds.map(rect=>rect.bottom))-top);
    // Shift the display origin only; retained object coordinates stay unchanged.
    stage.style.width=`${width}px`;stage.style.height=`${height}px`;
    stage.style.overflow='visible';
    items.forEach((item,index)=>{const annotation=printAnnotation({...item,x:item.x-left,y:item.y-top},height,index,width);annotation.style.overflow='visible';stage.append(annotation);});host.append(stage);
  }
  for(const file of host.querySelectorAll('figure[data-notebook-file]')){
    const caption=window.document.createElement('span');caption.textContent=`Attachment: ${file.getAttribute('name')||'File'} · ${attachmentHint}`;file.replaceChildren(caption);
  }
  for(const image of host.querySelectorAll('img')){
    const label=window.document.createElement('span');label.textContent=image.alt||'Saved image';image.replaceWith(label);
  }
  // Disable navigation in a historical snapshot and remove all fetching attributes.
  for(const link of host.querySelectorAll('a')){link.removeAttribute('href');link.removeAttribute('target');}
  for(const element of host.querySelectorAll('*'))for(const attribute of [...element.attributes])if(/^on/i.test(attribute.name)||['src','srcset','poster'].includes(attribute.name))element.removeAttribute(attribute.name);
  return host.innerHTML;
}
