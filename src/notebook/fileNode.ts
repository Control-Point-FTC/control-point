import { Node, mergeAttributes } from '@tiptap/core';
export const NotebookFile = Node.create({
  name:'notebookFile',group:'block',atom:true,selectable:true,draggable:true,
  addAttributes(){return {fileId:{default:null},name:{default:'Attachment'},mimeType:{default:'application/octet-stream'},size:{default:0},display:{default:'chip'},width:{default:640}};},
  parseHTML(){return [{tag:'figure[data-notebook-file]'}];},
  renderHTML({HTMLAttributes}){return ['figure',mergeAttributes(HTMLAttributes,{'data-notebook-file':'','contenteditable':'false'}),String(HTMLAttributes.name||'Attachment')];}
});
export function validNotebookFile(attrs:any){
  return Number.isSafeInteger(attrs.fileId) && attrs.fileId>0 && typeof attrs.name==='string' && attrs.name.length<=200 &&
    typeof attrs.mimeType==='string' && attrs.mimeType.length<=100 && Number.isSafeInteger(attrs.size) && attrs.size>=0 && attrs.size<=25*1024*1024 &&
    ['chip','image','pdf'].includes(attrs.display??'chip') && Number.isFinite(attrs.width??640) && (attrs.width??640)>=120 && (attrs.width??640)<=1600;
}
