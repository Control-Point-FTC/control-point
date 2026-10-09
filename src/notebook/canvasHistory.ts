import * as Y from 'yjs';
import type { NotebookSync } from './NotebookSync';
const histories=new WeakMap<NotebookSync,Map<string,{origin:symbol;undo:Y.UndoManager}>>();
/** Retain per-PDF-page undo while its lazy viewport is unmounted. */
export function pdfCanvasHistory(sync:NotebookSync,scope:string){
  let pages=histories.get(sync);
  if(!pages){pages=new Map();histories.set(sync,pages);sync.on('reset',()=>{for(const value of pages!.values())value.undo.clear();});}
  let history=pages.get(scope);
  if(!history){const origin=Symbol(`pdf-${scope}`),undo=new Y.UndoManager(sync.doc.getMap('canvas'),{trackedOrigins:new Set([origin]),captureTimeout:500});history={origin,undo};pages.set(scope,history);undo.on('stack-item-added',()=>{if(undo.undoStack.length>100)undo.undoStack.splice(0,undo.undoStack.length-100);});}
  return history;
}
