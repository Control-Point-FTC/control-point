import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import { notebookExtensions } from './editorSchema';
import type { NotebookSync } from './NotebookSync';
import { CANVAS_ORIGIN, canvasJSON, insertCanvasItem, type CanvasItem, type Ink, type Point, type Shape, type TextBox } from './canvasModel';
import { inkHit, inkPath, roundCanvas, simplifyInk, splitInk } from './canvasGeometry';
import './canvas.css';
type Tool = 'type' | 'select' | 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'shape';
const INK_COLORS = ['#111111', '#ffffff', '#e63946', '#f28c28', '#f5ce36', '#2caa65', '#2587db', '#9457c7'];
const HIGHLIGHT_COLORS = ['#ffe138', '#a7e868', '#ff97cb', '#8bd5ff', '#ffb66c'];
const emptyText = { type: 'doc', content: [{ type: 'paragraph' }] };
const base = (x: number, y: number, z: number) => ({ id: crypto.randomUUID(), x: roundCanvas(x), y: roundCanvas(y), width: 240, height: 120, z, rotation: 0, locked: false, groupId: null });
const StrokeView = memo(function StrokeView({ item }: {
    item: Ink;
}) {
    const highlighter = item.tool === 'highlighter';
    return <path data-canvas-id={item.id} d={inkPath(item)} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`} fill={highlighter ? 'none' : item.color} stroke={highlighter ? item.color : 'none'} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={item.opacity}/>;
});
function ShapeView({ item }: {
    item: Shape;
}) {
    const attrs = { stroke: item.color, strokeWidth: item.strokeWidth, fill: item.fill ?? 'none' };
    return <g data-canvas-id={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`}>
    {item.shape === 'rectangle' ? <rect width={item.width} height={item.height} {...attrs}/> : item.shape === 'ellipse' ? <ellipse cx={item.width / 2} cy={item.height / 2} rx={item.width / 2} ry={item.height / 2} {...attrs}/> : <><path d={`M0 0L${item.width} ${item.height}`} {...attrs}/>{item.shape === 'arrow' && <path d={`M${item.width - 14} ${item.height}L${item.width} ${item.height}L${item.width} ${item.height - 14}`} stroke={item.color} fill="none" strokeWidth={item.strokeWidth}/>}</>}
  </g>;
}
function CanvasText({ item, map, sync, editable, onFocus, onRemoved }: {
    item: TextBox;
    map: Y.Map<unknown>;
    sync: NotebookSync;
    editable: boolean;
    onFocus: (editor: Editor) => void;
    onRemoved: (editor: Editor) => void;
}) {
    const editor = useEditor({ extensions: [...notebookExtensions(true, editable), Collaboration.configure({ document: sync.doc, fragment: map.get('content') as Y.XmlFragment })], editable, editorProps: { attributes: { class: 'nb-prose nb-canvas-text-prose', role: 'textbox', 'aria-label': 'Canvas text', 'aria-multiline': 'true' } }, onFocus: ({ editor }) => onFocus(editor) }, [map, sync]);
    useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
    useEffect(() => () => { if (editor)
        onRemoved(editor); }, [editor, onRemoved]);
    return <EditorContent editor={editor}/>;
}
type Props = {
    sync: NotebookSync;
    editable: boolean;
    mobile: boolean;
    onRibbon: (panel: React.ReactNode) => void;
    onEditorFocus: (editor: Editor) => void;
    onEditorRemoved: (editor: Editor) => void;
    children: React.ReactNode;
};
export default function NotebookCanvas({ sync, editable, mobile, onRibbon, onEditorFocus, onEditorRemoved, children }: Props) {
    const root = useMemo(() => sync.doc.getMap<Y.Map<unknown>>('canvas'), [sync]);
    const [items, setItems] = useState<CanvasItem[]>(() => canvasJSON(sync.doc).objects);
    const [tool, setTool] = useState<Tool>('type'), [color, setColor] = useState('#111111'), [size, setSize] = useState(3);
    const [shape, setShape] = useState<Shape['shape']>('rectangle'), [eraserMode, setEraserMode] = useState('stroke'), [eraserSize, setEraserSize] = useState(12);
    const [selection, setSelection] = useState<string[]>([]), [draft, setDraft] = useState<Point[]>([]), [notice, setNotice] = useState('');
    const stage = useRef<HTMLDivElement>(null), gesture = useRef<{
        pointer: number;
        tool: Tool;
        start: Point;
        points: Point[];
        originals: CanvasItem[];
        resize: boolean;
    } | null>(null);
    const frame = useRef<number | null>(null), clipboard = useRef<CanvasItem[]>([]);
    const undo = useMemo(() => new Y.UndoManager(root, { trackedOrigins: new Set([CANVAS_ORIGIN]), captureTimeout: 500 }), [root]);
    const selected = items.filter(i => selection.includes(i.id));
    useEffect(() => {
        const update = () => { try {
            setItems(canvasJSON(sync.doc).objects);
            setSelection(ids => ids.filter(id => root.has(id)));
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : 'Cannot display canvas');
        } };
        root.observeDeep(update);
        const limit = () => { if (undo.undoStack.length > 100)
            undo.undoStack.splice(0, undo.undoStack.length - 100); };
        undo.on('stack-item-added', limit);
        return () => { root.unobserveDeep(update); undo.off('stack-item-added', limit); undo.destroy(); if (frame.current !== null)
            cancelAnimationFrame(frame.current); };
    }, [root, sync, undo]);
    const transact = (fn: () => void) => { undo.stopCapturing(); sync.doc.transact(fn, CANVAS_ORIGIN); undo.stopCapturing(); };
    const patchSelection = (values: Record<string, unknown>) => transact(() => { for (const id of selection) {
        const map = root.get(id);
        if (map)
            for (const [key, value] of Object.entries(values)) {
                if (key === 'color' && map.get('type') === 'text')
                    continue;
                map.set(key, value);
            }
    } });
    const duplicate = (source = selected) => {
        const groupIds = new Map<string, string>();
        transact(() => { for (const item of source) {
            const copy = structuredClone(item);
            copy.id = crypto.randomUUID();
            copy.x = Math.min(50000, copy.x + 24);
            copy.y = Math.min(50000, copy.y + 24);
            copy.z = Math.min(1000000, Math.max(0, ...items.map(o => o.z)) + 1);
            if (copy.groupId) {
                if (!groupIds.has(copy.groupId))
                    groupIds.set(copy.groupId, crypto.randomUUID());
                copy.groupId = groupIds.get(copy.groupId)!;
            }
            insertCanvasItem(sync.doc, copy);
        } });
    };
    useEffect(() => {
        if (mobile) {
            onRibbon(null);
            return;
        }
        onRibbon(<><div className="nb-draw-tools">{(['type', 'select', 'pen', 'highlighter', 'eraser', 'lasso', 'shape'] as Tool[]).map(t => <button key={t} className="nb-tool" disabled={!editable} aria-label={`Drawing ${t}`} aria-pressed={tool === t} onClick={() => { gesture.current = null; setDraft([]); setTool(t); }}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div><label>Ink <input aria-label="Ink color" type="color" value={color} disabled={!editable} onChange={e => setColor(e.target.value)}/></label><select aria-label="Stroke size" value={size} disabled={!editable} onChange={e => setSize(Number(e.target.value))}>{[[2, 'S'], [3, 'M'], [6, 'L'], [12, 'XL']].map(([n, label]) => <option key={n} value={n}>{label}</option>)}</select><div className="nb-ink-colors">{(tool === 'highlighter' ? HIGHLIGHT_COLORS : INK_COLORS).map(c => <button key={c} aria-label={`Ink ${c}`} disabled={!editable} style={{ background: c }} onClick={() => setColor(c)}/>)}</div>{tool === 'shape' && <select aria-label="Shape" disabled={!editable} value={shape} onChange={e => setShape(e.target.value as Shape['shape'])}>{['line', 'arrow', 'rectangle', 'ellipse'].map(t => <option key={t}>{t}</option>)}</select>}{tool === 'eraser' && <><select aria-label="Eraser mode" value={eraserMode} onChange={e => setEraserMode(e.target.value)}><option value="stroke">Whole stroke</option><option value="point">Point eraser</option></select><select aria-label="Eraser size" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))}>{[6, 12, 24, 48].map(n => <option key={n}>{n}</option>)}</select></>}<button className="nb-tool" disabled={!editable} onClick={() => undo.undo()}>Undo ink</button><button className="nb-tool" disabled={!editable} onClick={() => undo.redo()}>Redo ink</button>{selection.length > 0 && <details className="nb-canvas-actions"><summary>Selection · {selection.length}</summary><div><button disabled={!editable} onClick={() => duplicate()}>Duplicate</button><button onClick={() => { clipboard.current = structuredClone(selected); setNotice('Canvas selection copied.'); }}>Copy</button><button disabled={!editable} onClick={() => duplicate(clipboard.current)}>Paste</button><button disabled={!editable} onClick={() => transact(() => selection.forEach(id => root.delete(id)))}>Delete</button><button disabled={!editable} onClick={() => patchSelection({ locked: !selected.every(i => i.locked) })}>Lock / unlock position</button><button disabled={!editable} onClick={() => patchSelection({ groupId: crypto.randomUUID() })}>Group</button><button disabled={!editable} onClick={() => patchSelection({ groupId: null })}>Ungroup</button><button disabled={!editable} onClick={() => patchSelection({ z: Math.min(1000000, Math.max(0, ...items.map(i => i.z)) + 1) })}>Bring to front</button><button disabled={!editable} onClick={() => patchSelection({ z: Math.max(-1000000, Math.min(0, ...items.map(i => i.z)) - 1) })}>Send to back</button><button disabled={!editable} onClick={() => patchSelection({ color })}>Recolor ink / shapes</button></div></details>}</>);
    }, [tool, color, size, shape, eraserMode, eraserSize, selection, items, editable, mobile, undo, onRibbon]);
    const point = (e: React.PointerEvent | PointerEvent): Point => {
        const el = stage.current!, rect = el.getBoundingClientRect();
        return [roundCanvas((e.clientX - rect.left) * el.offsetWidth / rect.width), roundCanvas((e.clientY - rect.top) * el.offsetHeight / rect.height), roundCanvas(e.pointerType === 'pen' ? Math.max(.05, e.pressure) : .5)];
    };
    const erase = (p: Point) => { sync.doc.transact(() => { for (const item of items) {
        if (item.type !== 'stroke' || item.locked || !inkHit(item, [p[0], p[1]], eraserSize))
            continue;
        root.delete(item.id);
        if (eraserMode === 'point')
            for (const points of splitInk(item, [p[0], p[1]], eraserSize))
                insertCanvasItem(sync.doc, { ...item, id: crypto.randomUUID(), points });
    } }, CANVAS_ORIGIN); };
    const begin = (e: React.PointerEvent) => {
        if (!editable || mobile || e.button !== 0)
            return;
        if (gesture.current && gesture.current.pointer !== e.pointerId) {
            gesture.current = null;
            setDraft([]);
            return;
        }
        const p = point(e), target = (e.target as Element).closest('[data-canvas-id]')?.getAttribute('data-canvas-id');
        if (tool === 'type') {
            if ((e.target as Element).closest('.nb-flow,.nb-canvas-text'))
                return;
            const item: TextBox = { ...base(Math.max(0, p[0]), Math.max(0, p[1]), Math.max(0, ...items.map(i => i.z)) + 1), type: 'text', content: emptyText as TextBox['content'] };
            transact(() => insertCanvasItem(sync.doc, item));
            setSelection([item.id]);
            requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>(`[data-canvas-id="${item.id}"] [role=textbox]`)?.focus());
            return;
        }
        e.preventDefault();
        undo.stopCapturing();
        e.currentTarget.setPointerCapture(e.pointerId);
        let originals: CanvasItem[] = [];
        if (tool === 'select' && target) {
            const item = items.find(i => i.id === target);
            if (!item)
                return;
            let ids = selection.includes(target) ? selection : e.shiftKey ? [...selection, target] : item.groupId ? items.filter(i => i.groupId === item.groupId).map(i => i.id) : [target];
            setSelection(ids);
            originals = items.filter(i => ids.includes(i.id) && !i.locked);
        }
        else if (tool === 'select') {
            setSelection([]);
            return;
        }
        gesture.current = { pointer: e.pointerId, tool, start: p, points: [p], originals, resize: (e.target as Element).getAttribute('data-resize') === 'true' };
        if (tool === 'eraser')
            erase(p);
        else
            setDraft([p]);
    };
    const move = (e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || g.pointer !== e.pointerId)
            return;
        const p = point(e);
        if (g.tool === 'select') {
            const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
            sync.doc.transact(() => { for (const item of g.originals) {
                const map = root.get(item.id);
                if (!map)
                    continue;
                if (g.resize) {
                    const w = Math.max(20, Math.min(50000, item.width + dx)), h = Math.max(20, Math.min(50000, item.height + dy));
                    map.set('width', w);
                    map.set('height', h);
                    if (item.type === 'stroke')
                        map.set('points', item.points.map(p => [roundCanvas(p[0] * w / item.width), roundCanvas(p[1] * h / item.height), p[2]]));
                }
                else {
                    map.set('x', Math.max(0, Math.min(50000, roundCanvas(item.x + dx))));
                    map.set('y', Math.max(0, Math.min(50000, roundCanvas(item.y + dy))));
                }
            } }, CANVAS_ORIGIN);
            return;
        }
        if (g.tool === 'eraser') {
            erase(p);
            return;
        }
        const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        for (const sample of samples)
            if (g.points.length < 10000)
                g.points.push(point(sample));
        if (frame.current === null)
            frame.current = requestAnimationFrame(() => { frame.current = null; setDraft([...g.points]); });
    };
    const finish = (e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || g.pointer !== e.pointerId)
            return;
        gesture.current = null;
        if (frame.current !== null) {
            cancelAnimationFrame(frame.current);
            frame.current = null;
        }
        setDraft([]);
        if (e.type === 'pointercancel') {
            undo.stopCapturing();
            return;
        }
        const p = point(e);
        g.points.push(p);
        try {
            if (g.tool === 'lasso') {
                const x = Math.min(g.start[0], p[0]), y = Math.min(g.start[1], p[1]), w = Math.abs(p[0] - g.start[0]), h = Math.abs(p[1] - g.start[1]);
                setSelection(items.filter(i => i.x <= x + w && i.x + i.width >= x && i.y <= y + h && i.y + i.height >= y).map(i => i.id));
                setTool('select');
            }
            else if (g.tool === 'pen' || g.tool === 'highlighter') {
                const points = simplifyInk(g.points), x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
                const item: Ink = { ...base(x, y, Math.max(0, ...items.map(i => i.z)) + 1), type: 'stroke', tool: g.tool, color, strokeWidth: g.tool === 'highlighter' ? size * 6 : size, opacity: g.tool === 'highlighter' ? .35 : 1, width: Math.max(.1, Math.max(...points.map(p => p[0])) - x), height: Math.max(.1, Math.max(...points.map(p => p[1])) - y), points: points.map(p => [roundCanvas(p[0] - x), roundCanvas(p[1] - y), p[2]]) };
                insertCanvasItem(sync.doc, item);
            }
            else if (g.tool === 'shape') {
                let width = Math.max(1, Math.abs(p[0] - g.start[0])), height = Math.max(1, Math.abs(p[1] - g.start[1]));
                if (e.shiftKey)
                    width = height = Math.max(width, height);
                insertCanvasItem(sync.doc, { ...base(Math.min(g.start[0], p[0]), Math.min(g.start[1], p[1]), Math.max(0, ...items.map(i => i.z)) + 1), type: 'shape', shape, color, fill: null, strokeWidth: size, width, height });
            }
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : 'Cannot save drawing');
        }
        undo.stopCapturing();
    };
    const width = Math.max(0, ...items.map(i => i.x + i.width + 40)), height = Math.max(600, ...items.map(i => i.y + i.height + 40));
    return <div ref={stage} className="nb-canvas-stage" data-tool={mobile ? 'type' : tool} style={{ minWidth: Math.min(50000, width), minHeight: Math.min(50000, height) }} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={e => {
            if ((e.target as Element).closest('[role=textbox]'))
                return;
            if (e.key === 'Escape') {
                gesture.current = null;
                setDraft([]);
                setTool('type');
                setSelection([]);
            }
            if (!editable || mobile)
                return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                e.shiftKey ? undo.redo() : undo.undo();
            }
            if (e.key === 'Delete' && selection.length) {
                e.preventDefault();
                transact(() => selection.forEach(id => root.delete(id)));
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && selection.length) {
                e.preventDefault();
                const d = e.shiftKey ? 10 : 1;
                transact(() => { for (const item of selected) {
                    if (item.locked)
                        continue;
                    const map = root.get(item.id)!;
                    map.set('x', Math.max(0, Math.min(50000, item.x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0))));
                    map.set('y', Math.max(0, Math.min(50000, item.y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0))));
                } });
            }
        }} tabIndex={0} aria-label="Page drawing surface">
    <svg className="nb-canvas-highlighter" width="100%" height="100%" aria-label="Page highlights">{items.filter((i): i is Ink => i.type === 'stroke' && i.tool === 'highlighter').map(i => <StrokeView key={i.id} item={i}/>)}</svg>
    <div className="nb-flow">{children}</div>
    <svg className="nb-canvas-ink" width="100%" height="100%" aria-label="Page drawings">{items.filter(i => i.type !== 'text' && !(i.type === 'stroke' && i.tool === 'highlighter')).map(i => i.type === 'stroke' ? <StrokeView key={i.id} item={i}/> : <ShapeView key={i.id} item={i as Shape}/>)}</svg>
    {items.filter((i): i is TextBox => i.type === 'text').map(item => <div key={item.id} data-canvas-id={item.id} className={`nb-canvas-text ${selection.includes(item.id) ? 'is-selected' : ''}`} style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height, zIndex: 10 + item.z, transform: `rotate(${item.rotation}deg)` }}><CanvasText item={item} map={root.get(item.id)!} sync={sync} editable={editable && !mobile && tool === 'type'} onFocus={onEditorFocus} onRemoved={onEditorRemoved}/>{editable && !mobile && selection.includes(item.id) && <span data-resize="true" className="nb-canvas-resize"/>}</div>)}
    {!mobile && <svg className="nb-canvas-live" width="100%" height="100%" aria-hidden="true">{draft.length > 0 && <path d={draft.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')} fill="none" stroke={color} strokeWidth={tool === 'highlighter' ? size * 6 : size} opacity={tool === 'highlighter' ? .35 : 1} strokeLinecap="round"/>}{selected.map(i => <rect key={i.id} x={i.x - 4} y={i.y - 4} width={i.width + 8} height={i.height + 8} fill="none" stroke="#08b6d0" strokeWidth="1" strokeDasharray="5 3"/>)}</svg>}
    {notice && <div className="nb-canvas-notice" role="status">{notice}<button aria-label="Dismiss drawing message" onClick={() => setNotice('')}>×</button></div>}
  </div>;
}
