import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { canvasJSON, insertCanvasItem, seedCanvas, validatedCanvas, type Ink } from '../canvasModel';
import { inkHit, splitInk } from '../canvasGeometry';
const stroke = (id: string): Ink => ({ id, type:'stroke', tool:'pen', x:0,y:0,width:100,height:20,z:1,rotation:0,locked:false,groupId:null,color:'#111111',strokeWidth:2,opacity:1,points:[[0,10,.5],[100,10,.5]] });
describe('shared notebook canvas', () => {
  it('merges independent strokes without dropping either author’s ink', () => {
    const a = new Y.Doc(), b = new Y.Doc();
    try { insertCanvasItem(a,stroke('alice')); insertCanvasItem(b,stroke('bob')); Y.applyUpdate(a,Y.encodeStateAsUpdate(b)); Y.applyUpdate(b,Y.encodeStateAsUpdate(a)); expect(canvasJSON(a).objects.map(o=>o.id).sort()).toEqual(['alice','bob']); expect(canvasJSON(a)).toEqual(canvasJSON(b)); } finally { a.destroy(); b.destroy(); }
  });
  it('preserves rich text boxes when seeding a page or revision', () => {
    const doc = new Y.Doc();
    try { const text = { ...stroke('text'), type:'text', content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Shared idea',marks:[{type:'bold'}]}]}]} } as any; for (const k of ['tool','color','strokeWidth','opacity','points']) delete text[k]; seedCanvas(doc,{version:1,objects:[text]}); expect((canvasJSON(doc).objects[0] as any).content.content[0].content[0].marks).toEqual([{type:'bold',attrs:{}}]); } finally { doc.destroy(); }
  });
  it('rejects hidden metadata, invalid coordinates, duplicate IDs and excessive points', () => {
    for (const objects of [[{...stroke('one'), secret:'hidden'}],[{...stroke('one'), x:Infinity}],[stroke('one'),stroke('one')],[{...stroke('one'),points:Array(10001).fill([0,0,.5])}]]) expect(()=>validatedCanvas({version:1,objects})).toThrow();
  });
  it('splits a sparsely sampled line at the eraser boundaries instead of reconnecting the gap', () => {
    const ink = stroke('one'); expect(inkHit(ink,[50,10],5)).toBe(true);
    const parts = splitInk(ink,[50,10],5); expect(parts).toHaveLength(2); expect(parts[0].at(-1)![0]).toBe(44); expect(parts[1][0][0]).toBe(56);
  });
});
