import { Node, mergeAttributes } from '@tiptap/core';
export const NotebookFile = Node.create({
  name:'notebookFile',group:'block',atom:true,selectable:true,draggable:true,
  addAttributes(){return {fileId:{default:null,parseHTML:element=>element.hasAttribute('fileId')?Number(element.getAttribute('fileId')):null},name:{default:'Attachment'},mimeType:{default:'application/octet-stream'},size:{default:0,parseHTML:element=>element.hasAttribute('size')?Number(element.getAttribute('size')):0},display:{default:'chip'},width:{default:640,parseHTML:element=>element.hasAttribute('width')?Number(element.getAttribute('width')):640},alt:{default:null,parseHTML:element=>element.getAttribute('alt')||null},crop:{default:null,parseHTML:element=>element.getAttribute('crop')||null}};},
  parseHTML(){return [{tag:'figure[data-notebook-file]'}];},
  renderHTML({HTMLAttributes}){return ['figure',mergeAttributes(HTMLAttributes,{'data-notebook-file':'','contenteditable':'false'}),String(HTMLAttributes.name||'Attachment')];}
});
/** Alt text: what a picture shows, for screen readers and when it can't load. */
export const MAX_ALT=300;
/** The visible part of a picture, as fractions of its full size: "x,y,w,h". Null shows all of it. */
export type ImageCrop={x:number;y:number;w:number;h:number};
export const FULL_CROP:ImageCrop={x:0,y:0,w:1,h:1};
export function parseCrop(value:unknown):ImageCrop|null{
  if(typeof value!=='string'||value.length>64)return null;
  const parts=value.split(',').map(Number);if(parts.length!==4||parts.some(n=>!Number.isFinite(n)))return null;
  const [x,y,w,h]=parts;return x>=0&&y>=0&&w>=0.02&&h>=0.02&&x+w<=1.0001&&y+h<=1.0001?{x,y,w,h}:null;
}
export const cropText=(crop:ImageCrop)=>[crop.x,crop.y,crop.w,crop.h].map(n=>Math.round(n*10000)/10000).join(',');
export function validNotebookFile(attrs:any){
  return Number.isSafeInteger(attrs.fileId) && attrs.fileId>0 && typeof attrs.name==='string' && attrs.name.length<=200 &&
    typeof attrs.mimeType==='string' && attrs.mimeType.length<=100 && Number.isSafeInteger(attrs.size) && attrs.size>=0 && attrs.size<=25*1024*1024 &&
    ['chip','image','pdf'].includes(attrs.display??'chip') && Number.isFinite(attrs.width??640) && (attrs.width??640)>=120 && (attrs.width??640)<=1600 &&
    (attrs.alt==null || (typeof attrs.alt==='string' && attrs.alt.length<=MAX_ALT)) && (attrs.crop==null || parseCrop(attrs.crop)!==null);
}
