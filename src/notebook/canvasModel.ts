import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { notebookSchema, validatedNotebookDocument } from './editorSchema';
export type Point = [
    number,
    number,
    number
];
type Base = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    z: number;
    rotation: number;
    locked: boolean;
    groupId: string | null;
};
export type Ink = Base & {
    type: 'stroke';
    tool: 'pen' | 'highlighter';
    color: string;
    strokeWidth: number;
    opacity: number;
    points: Point[];
};
export type Shape = Base & {
    type: 'shape';
    shape: 'line' | 'arrow' | 'rectangle' | 'ellipse';
    color: string;
    fill: string | null;
    strokeWidth: number;
};
export type TextBox = Base & {
    type: 'text';
    content: ReturnType<typeof validatedNotebookDocument>;
};
export type CanvasItem = Ink | Shape | TextBox;
export type NotebookCanvas = {
    version: 1;
    objects: CanvasItem[];
};
export const CANVAS_ORIGIN = Symbol('notebook-canvas-edit');
const validId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function fail(): never { throw new Error('Unsupported or invalid notebook canvas'); }
export function validatedCanvas(value: unknown): NotebookCanvas {
    if (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)
        return { version: 1, objects: [] };
    const canvas = value as NotebookCanvas;
    if (!canvas || canvas.version !== 1 || Object.keys(canvas).some(k => !['version', 'objects'].includes(k)) || !Array.isArray(canvas.objects) || canvas.objects.length > 5000)
        fail();
    const ids = new Set<string>();
    let points = 0;
    for (const item of canvas.objects) {
        if (!item || !validId(item.id) || ids.has(item.id))
            fail();
        ids.add(item.id);
        if (!finite(item.x, -50000, 50000) || !finite(item.y, -50000, 50000) || !finite(item.width, .1, 50000) || !finite(item.height, .1, 50000) || !finite(item.z, -1000000, 1000000) || !finite(item.rotation, -360, 360) || typeof item.locked !== 'boolean' || item.groupId !== null && !validId(item.groupId))
            fail();
        const keys = ['id', 'type', 'x', 'y', 'width', 'height', 'z', 'rotation', 'locked', 'groupId'];
        if (item.type === 'text') {
            keys.push('content');
            validatedNotebookDocument(item.content);
        }
        else if (item.type === 'stroke') {
            keys.push('tool', 'color', 'strokeWidth', 'opacity', 'points');
            if (!['pen', 'highlighter'].includes(item.tool) || !color(item.color) || !finite(item.strokeWidth, .5, 64) || !finite(item.opacity, .1, 1) || !Array.isArray(item.points) || !item.points.length || item.points.length > 10000)
                fail();
            points += item.points.length;
            if (points > 200000)
                fail();
            for (const p of item.points)
                if (!Array.isArray(p) || p.length !== 3 || !finite(p[0], -50000, 50000) || !finite(p[1], -50000, 50000) || !finite(p[2], 0, 1))
                    fail();
        }
        else if (item.type === 'shape') {
            keys.push('shape', 'color', 'fill', 'strokeWidth');
            if (!['line', 'arrow', 'rectangle', 'ellipse'].includes(item.shape) || !color(item.color) || item.fill !== null && !color(item.fill) || !finite(item.strokeWidth, .5, 64))
                fail();
        }
        else
            fail();
        if (Object.keys(item).some(k => !keys.includes(k)))
            fail();
    }
    // Same budget in the browser and server; encoders never silently truncate ink.
    if (new TextEncoder().encode(JSON.stringify(canvas)).length > 4000000)
        throw new Error('Canvas is full. Move some drawings to another page.');
    return { version: 1, objects: [...canvas.objects].sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
}
export function canvasJSON(doc: Y.Doc): NotebookCanvas {
    const root = doc.getMap<Y.Map<unknown>>('canvas');
    if (root.size > 5000)
        fail();
    const objects: CanvasItem[] = [];
    for (const [id, map] of root) {
        if (!validId(id) || !(map instanceof Y.Map))
            fail();
        const item: Record<string, unknown> = { ...map.toJSON(), id };
        if (map.has('id'))
            fail();
        if (map.get('type') === 'text') {
            const fragment = map.get('content');
            if (!(fragment instanceof Y.XmlFragment))
                fail();
            item.content = yXmlFragmentToProsemirrorJSON(fragment);
        }
        objects.push(item as CanvasItem);
    }
    return validatedCanvas({ version: 1, objects });
}
export function insertCanvasItem(doc: Y.Doc, value: CanvasItem, origin: unknown = CANVAS_ORIGIN) {
    validatedCanvas({ version: 1, objects: [...canvasJSON(doc).objects, value] });
    return insertValidatedItem(doc, value, origin);
}
function insertValidatedItem(doc: Y.Doc, value: CanvasItem, origin: unknown) {
    const root = doc.getMap<Y.Map<unknown>>('canvas');
    if (root.has(value.id))
        throw new Error('Canvas item already exists');
    const map = new Y.Map<unknown>();
    doc.transact(() => {
        root.set(value.id, map);
        for (const [key, field] of Object.entries(value)) {
            if (key === 'id')
                continue;
            if (key === 'content' && value.type === 'text') {
                const fragment = new Y.XmlFragment();
                map.set('content', fragment);
                prosemirrorJSONToYXmlFragment(notebookSchema, value.content, fragment);
            }
            else
                map.set(key, field);
        }
    }, origin);
    return map;
}
export function seedCanvas(doc: Y.Doc, value: unknown) {
    const objects = validatedCanvas(value).objects;
    if (doc.getMap('canvas').size) throw new Error('Canvas seed requires an empty document');
    doc.transact(() => {
        for (const item of objects) insertValidatedItem(doc, item, 'server-seed');
    }, 'server-seed');
}
