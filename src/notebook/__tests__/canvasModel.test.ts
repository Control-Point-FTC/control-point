import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { canvasJSON, insertCanvasItem, insertCanvasItems, replaceCanvasItems, copiedTextBoxContent, seedCanvas, validatedCanvas, type Ink } from '../canvasModel';
import { directedLine, inkHit, lassoHit, splitInk } from '../canvasGeometry';
const stroke = (id: string): Ink => ({ id, type: 'stroke', tool: 'pen', x: 0, y: 0, width: 100, height: 20, z: 1, rotation: 0, locked: false, groupId: null, color: '#111111', strokeWidth: 2, opacity: 1, points: [[0, 10, .5], [100, 10, .5]] });
describe('shared notebook canvas', () => {
    it('keeps all untouched ink when an eraser split exceeds object capacity', () => {
        const doc = new Y.Doc();
        try {
            seedCanvas(doc,{version:1,objects:Array.from({length:5000},(_,i)=>stroke(`ink-${i}`))});
            const before = Y.encodeStateAsUpdate(doc);
            expect(() => replaceCanvasItems(doc,['ink-0'],[stroke('part-a'),stroke('part-b')])).toThrow();
            expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
            replaceCanvasItems(doc,['ink-0'],[stroke('replacement')]);
            expect(doc.getMap('canvas').size).toBe(5000);
        } finally { doc.destroy(); }
    },20000);
    it('gives copied rich-text discussion targets fresh nested IDs', () => {
        const original:any = {type:'doc',content:[{type:'blockquote',attrs:{id:'quote'},content:[{type:'paragraph',attrs:{id:'paragraph'},content:[{type:'text',text:'Same words'}]}]}]};
        const copy:any = copiedTextBoxContent(original);
        expect(copy.content[0].attrs.id).not.toBe('quote');
        expect(copy.content[0].content[0].attrs.id).not.toBe('paragraph');
        expect(original.content[0].attrs.id).toBe('quote');
        expect(copy.content[0].content[0].content[0].text).toBe('Same words');
    });
    it('preserves leftward line direction and snaps angles only on request', () => {
        const line = directedLine([300,100,.5],[100,200,.5],false);
        const radians = line.rotation * Math.PI / 180;
        const center = [line.x + line.width/2, line.y + line.height/2];
        expect(center[0] - Math.cos(radians)*line.width/2).toBeCloseTo(300,1);
        expect(center[1] - Math.sin(radians)*line.width/2).toBeCloseTo(100,1);
        expect(center[0] + Math.cos(radians)*line.width/2).toBeCloseTo(100,1);
        expect(center[1] + Math.sin(radians)*line.width/2).toBeCloseTo(200,1);
        expect(directedLine([300,100,.5],[100,200,.5],true).rotation).toBe(135);
    });
    it('rejects a full canvas insertion before mutating the shared document', () => {
        const doc = new Y.Doc();
        try {
            seedCanvas(doc, { version: 1, objects: Array.from({ length: 4999 }, (_, i) => stroke(`stroke-${i}`)) });
            expect(() => insertCanvasItems(doc, [stroke('first-copy'),stroke('second-copy')])).toThrow();
            expect(doc.getMap('canvas').size).toBe(4999);
            insertCanvasItem(doc, stroke('last-allowed'));
            const before = Y.encodeStateVector(doc);
            expect(() => insertCanvasItem(doc, stroke('overflow'))).toThrow();
            expect(doc.getMap('canvas').size).toBe(5000);
            expect(Y.encodeStateVector(doc)).toEqual(before);
        } finally { doc.destroy(); }
    });
    it('uses the drawn lasso polygon rather than its enclosing rectangle', () => {
        const polygon: [number,number,number][] = [[0,0,.5],[100,0,.5],[0,100,.5],[0,0,.5]];
        expect(lassoHit({ ...stroke('inside'), x: 10, y: 10, width: 10, points: [[0,0,.5],[10,0,.5]] }, polygon)).toBe(true);
        expect(lassoHit({ ...stroke('outside'), x: 80, y: 80, width: 10, points: [[0,0,.5],[10,0,.5]] }, polygon)).toBe(false);
        expect(lassoHit({ ...stroke('crosses'), points: [[-20,20,.5],[120,20,.5]] }, polygon)).toBe(true);
    });
    it('erases a rotated stroke at its visible position', () => {
        const ink = { ...stroke('rotated'), rotation: 90 };
        expect(inkHit(ink, [50, 40], 5)).toBe(true);
        expect(inkHit(ink, [90, 10], 5)).toBe(false);
        const parts = splitInk(ink, [50, 10], 5);
        expect(parts).toHaveLength(2);
        expect(parts[0].at(-1)![0]).toBe(44);
        expect(parts[1][0][0]).toBe(56);
    });
    it('merges independent strokes without dropping either author’s ink', () => {
        const a = new Y.Doc(), b = new Y.Doc();
        try {
            insertCanvasItem(a, stroke('alice'));
            insertCanvasItem(b, stroke('bob'));
            Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
            Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
            expect(canvasJSON(a).objects.map(o => o.id).sort()).toEqual(['alice', 'bob']);
            expect(canvasJSON(a)).toEqual(canvasJSON(b));
        }
        finally {
            a.destroy();
            b.destroy();
        }
    });
    it('preserves rich text boxes when seeding a page or revision', () => {
        const doc = new Y.Doc();
        try {
            const text = { ...stroke('text'), type: 'text', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared idea', marks: [{ type: 'bold' }] }] }] } } as any;
            for (const k of ['tool', 'color', 'strokeWidth', 'opacity', 'points'])
                delete text[k];
            seedCanvas(doc, { version: 1, objects: [text] });
            expect((canvasJSON(doc).objects[0] as any).content.content[0].content[0].marks).toEqual([{ type: 'bold', attrs: {} }]);
        }
        finally {
            doc.destroy();
        }
    });
    it('rejects hidden metadata, invalid coordinates, duplicate IDs and excessive points', () => {
        for (const objects of [[{ ...stroke('one'), secret: 'hidden' }], [{ ...stroke('one'), x: Infinity }], [stroke('one'), stroke('one')], [{ ...stroke('one'), points: Array(10001).fill([0, 0, .5]) }]])
            expect(() => validatedCanvas({ version: 1, objects })).toThrow();
    });
    it('splits a sparsely sampled line at the eraser boundaries instead of reconnecting the gap', () => {
        const ink = stroke('one');
        expect(inkHit(ink, [50, 10], 5)).toBe(true);
        const parts = splitInk(ink, [50, 10], 5);
        expect(parts).toHaveLength(2);
        expect(parts[0].at(-1)![0]).toBe(44);
        expect(parts[1][0][0]).toBe(56);
    });
});
