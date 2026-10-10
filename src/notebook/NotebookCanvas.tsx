import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import { AllSelection } from '@tiptap/pm/state';
import { notebookExtensions } from './editorSchema';
import { AutoCapitalize, autoCapitalizeEnabled, rememberCapital } from './autoCapitalize';
import type { NotebookSync } from './NotebookSync';
import { CANVAS_ORIGIN, canvasJSON, insertCanvasItem, insertCanvasItems, replaceCanvasItems, copiedTextBoxContent, type CanvasItem, type Ink, type Point, type Shape, type TextBox } from './canvasModel';
import { directedLine, inkHit, inkPath, lassoHit, roundCanvas, simplifyInk, splitInk } from './canvasGeometry';
import { notebookCommandGlyph } from './NotebookIcons';
import './canvas.css';
import { NotebookRuler, snapToRuler, type Ruler } from './NotebookRuler';
import { readDrawingPreferences, type DrawingTool } from './drawingPreferences';
import { pdfCanvasHistory } from './canvasHistory';
import { NotebookFileView } from './NotebookAttachments';
import { notebookPageLink } from './pageLinks';
import { backgroundStyle, FormatBackground, useCanvasBackground } from './canvasBackground';
type Tool = DrawingTool;
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
    {item.shape === 'rectangle' ? <rect width={item.width} height={item.height} {...attrs}/> : item.shape === 'ellipse' ? <ellipse cx={item.width / 2} cy={item.height / 2} rx={item.width / 2} ry={item.height / 2} {...attrs}/> : <><path d={`M0 ${item.height / 2}L${item.width} ${item.height / 2}`} {...attrs}/>{item.shape === 'arrow' && <path d={`M${item.width - 12} ${item.height / 2 - 6}L${item.width} ${item.height / 2}L${item.width - 12} ${item.height / 2 + 6}`} stroke={item.color} fill="none" strokeWidth={item.strokeWidth}/>}</>}
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
    const editor = useEditor({ extensions: [...notebookExtensions(true, editable,NotebookFileView), AutoCapitalize, Collaboration.configure({ document: sync.doc, fragment: map.get('content') as Y.XmlFragment })], editable, editorProps: { attributes: { class: 'nb-prose nb-canvas-text-prose', role: 'textbox', 'aria-label': 'Canvas text', 'aria-multiline': 'true' },
        // Double-click selects a word (browser default); triple-click selects the whole box.
        handleTripleClick: view => { view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc))); return true; } }, onFocus: ({ editor }) => onFocus(editor) }, [map, sync]);
    useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
    useEffect(() => () => { if (editor)
        onRemoved(editor); }, [editor, onRemoved]);
    return <EditorContent editor={editor}/>;
}
type Props = {
    sync: NotebookSync;
    scopeId?: string;
    active?: boolean;
    onActivate?: () => void;
    editable: boolean;
    mobile: boolean;
    onRibbon: (panel: React.ReactNode) => void;
    onEditorFocus: (editor: Editor) => void;
    onEditorRemoved: (editor: Editor) => void;
    zoom?: number;
    onZoom?: (zoom: number) => void;
    onSelectionChange?: (target: string | null) => void;
    anchorTarget?: string | null;
    children: React.ReactNode;
};
export default function NotebookCanvas({ sync, editable, mobile, onRibbon, onEditorFocus, onEditorRemoved, zoom = 100, onZoom, onSelectionChange, anchorTarget, scopeId, active = true, onActivate, children }: Props) {
    const retainedHistory = useMemo(() => scopeId ? pdfCanvasHistory(sync,scopeId) : null,[sync,scopeId]);
    const canvasOrigin = retainedHistory?.origin ?? CANVAS_ORIGIN;
    const scopedItems = () => canvasJSON(sync.doc).objects.filter(item => item.pdfScope === scopeId);
    const scopedBase = (x:number,y:number,z:number) => ({...base(x,y,z),...(scopeId?{pdfScope:scopeId}:{})});
    const root = useMemo(() => sync.doc.getMap<Y.Map<unknown>>('canvas'), [sync]);
    // Draw → Format Background applies to the page's own canvas, not PDF overlays.
    const surface = useCanvasBackground(sync);
    const [items, setItems] = useState<CanvasItem[]>(() => scopedItems());
    const preferenceKey = sync.scope ? `cp:notebook:drawing:${sync.scope.memberId}:${sync.scope.teamId}` : undefined;
    const preferences = useMemo(() => readDrawingPreferences(preferenceKey), [preferenceKey]);
    const [ruler, setRuler] = useState<Ruler>({ x: 60, y: 180, angle: 0 });
    const [rulerVisible, setRulerVisible] = useState(preferences.tool === 'ruler');
    const [selectedTool, setTool] = useState<Tool>(preferences.tool), [color, setColor] = useState(preferences.color), [size, setSize] = useState(preferences.size);
    const tool: Tool = editable ? selectedTool : 'type';
    const [shape, setShape] = useState<Shape['shape']>('rectangle'), [eraserMode, setEraserMode] = useState('stroke'), [eraserSize, setEraserSize] = useState(12);
    // Type mode, like a paper page: click empty space to put a caret there;
    // the text box appears when typing starts (double-click makes it at once).
    // The caret is a real text field, so every keyboard and IME works, and
    // what's typed while the box's editor gets ready is carried into it.
    const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
    const caretInput = useRef<HTMLTextAreaElement>(null);
    // The caret's text, kept outside the field so it survives the field going away (e.g. a tool switch).
    const caretText = useRef('');
    // Where the caret was when its field got focus: a blur that comes after a
    // click elsewhere on the canvas must not clear the newly placed caret.
    const caretFocusedAt = useRef<{ x: number; y: number } | null>(null);
    const opening = useRef<{ id: string; focus: boolean } | null>(null);
    useEffect(() => {
        if (!pending) return;
        const frame = requestAnimationFrame(() => caretInput.current?.focus({ preventScroll: true }));
        return () => cancelAnimationFrame(frame);
    }, [pending]);
    const [selection, setSelection] = useState<string[]>([]), [draft, setDraft] = useState<Point[]>([]), [notice, setNotice] = useState('');
    const [hasClipboard, setHasClipboard] = useState(false);
    const stage = useRef<HTMLDivElement>(null), gesture = useRef<{
        pointer: number;
        pointerType: string;
        tool: Tool;
        start: Point;
        points: Point[];
        originals: CanvasItem[];
        resize: boolean;
    } | null>(null);
    const frame = useRef<number | null>(null), clipboard = useRef<CanvasItem[]>([]);
    const touches = useRef(new Map<number, { x: number; y: number }>());
    const pan = useRef<{ x: number; y: number; distance: number; zoom: number; scroll: HTMLElement; left: number; top: number } | null>(null);
    const clearGesture = () => {
        const active = gesture.current;
        gesture.current = null;
        if (active && stage.current?.hasPointerCapture?.(active.pointer)) stage.current.releasePointerCapture(active.pointer);
        if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
        touches.current.clear(); pan.current = null; setDraft([]);
    };
    const touchMetrics = () => { const [a,b] = [...touches.current.values()]; return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)) }; };
    const undo = useMemo(() => retainedHistory?.undo ?? new Y.UndoManager(root, { trackedOrigins: new Set([canvasOrigin]), captureTimeout: 500 }), [root, retainedHistory]);
    const selected = items.filter(i => selection.includes(i.id));
    useEffect(() => {
        if (!anchorTarget || !/^[\w-]{1,100}$/.test(anchorTarget)) return;
        const target = stage.current?.querySelector(`[data-canvas-id="${anchorTarget}"]`);
        target?.scrollIntoView({ block:'center', behavior:'smooth' }); target?.classList.add('nb-linked-block');
        const timer = setTimeout(() => target?.classList.remove('nb-linked-block'),2500);
        return () => { clearTimeout(timer); target?.classList.remove('nb-linked-block'); };
    }, [anchorTarget, items]);
    useEffect(() => { if (active) onSelectionChange?.(selected.length === 1 ? selected[0].id : null); }, [selection, items, onSelectionChange, active]);
    useEffect(() => {
        if (!preferenceKey || mobile) return;
        try { localStorage.setItem(preferenceKey, JSON.stringify({ tool:selectedTool, color, size })); } catch { /* Optional device preference. */ }
    }, [preferenceKey, mobile, selectedTool, color, size]);
    useEffect(() => {
        const reset = () => { undo.clear(); clearGesture(); setSelection([]); };
        sync.on('reset', reset);
        return () => { sync.off('reset', reset); };
    }, [sync, undo]);
    useEffect(() => {
        const update = () => { try {
            setItems(scopedItems());
            setSelection(ids => ids.filter(id => root.has(id)));
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : 'Cannot display canvas');
        } };
        root.observeDeep(update);
        const limit = () => { if (undo.undoStack.length > 100)
            undo.undoStack.splice(0, undo.undoStack.length - 100); };
        undo.on('stack-item-added', limit);
        return () => { root.unobserveDeep(update); undo.off('stack-item-added', limit); if(!retainedHistory) undo.destroy(); if (frame.current !== null)
            cancelAnimationFrame(frame.current); };
    }, [root, sync, undo, scopeId]);
    const transact = (fn: () => void) => { undo.stopCapturing(); sync.doc.transact(fn, canvasOrigin); undo.stopCapturing(); };
    const patchSelection = (values: Record<string, unknown>) => transact(() => { for (const id of selection) {
        const map = root.get(id);
        if (map)
            for (const [key, value] of Object.entries(values)) {
                if (['color','strokeWidth','opacity'].includes(key) && map.get('type') === 'text' || key === 'fill' && map.get('type') !== 'shape')
                    continue;
                map.set(key, value);
            }
    } });
    const duplicate = (source = selected, done?: string) => {
        const groupIds = new Map<string, string>();
        const copies: CanvasItem[] = [];
        for (const item of source) {
            const copy = structuredClone(item);
            copy.id = crypto.randomUUID();
            if (copy.type === 'text') copy.content = copiedTextBoxContent(copy.content);
            copy.x = Math.min(50000, copy.x + 24);
            copy.y = Math.min(50000, copy.y + 24);
            copy.z = Math.min(1000000, Math.max(0, ...items.map(o => o.z)) + 1);
            if (copy.groupId) {
                if (!groupIds.has(copy.groupId))
                    groupIds.set(copy.groupId, crypto.randomUUID());
                copy.groupId = groupIds.get(copy.groupId)!;
            }
            copies.push(copy);
        }
        try { transact(() => insertCanvasItems(sync.doc, copies)); setSelection(copies.map(i => i.id)); if (done) setNotice(`${done} ${copies.length} ${copies.length === 1 ? 'item' : 'items'}.`); }
        catch (e) { setNotice(e instanceof Error ? e.message : 'Cannot paste canvas items'); }
    };
    useEffect(() => {
        if (!active) return;
        if (mobile) {
            onRibbon(null);
            return;
        }
        onRibbon(<>{!scopeId && <FormatBackground sync={sync} editable={editable} notify={setNotice} />}<div className="nb-draw-tools">{(['type', 'select', 'pen', 'highlighter', 'eraser', 'lasso', 'shape', 'ruler'] as Tool[]).map(t => <button key={t} className="nb-tool" disabled={!editable} aria-label={`Drawing ${t}`} aria-pressed={tool === t} onClick={() => { clearGesture(); setTool(t); if (t === 'ruler') setRulerVisible(true); }}>{React.createElement(notebookCommandGlyph(t)!)}<span>{t[0].toUpperCase() + t.slice(1)}</span></button>)}</div><label>Ink <input aria-label="Ink color" type="color" value={color} disabled={!editable} onChange={e => setColor(e.target.value)}/></label><select aria-label="Stroke size" value={size} disabled={!editable} onChange={e => setSize(Number(e.target.value))}>{[[2, 'S'], [3, 'M'], [6, 'L'], [12, 'XL']].map(([n, label]) => <option key={n} value={n}>{label}</option>)}</select><div className="nb-ink-colors">{(tool === 'highlighter' ? HIGHLIGHT_COLORS : INK_COLORS).map(c => <button key={c} aria-label={`Ink ${c}`} disabled={!editable} style={{ background: c }} onClick={() => setColor(c)}/>)}</div>{tool === 'shape' && <select aria-label="Shape" disabled={!editable} value={shape} onChange={e => setShape(e.target.value as Shape['shape'])}>{['line', 'arrow', 'rectangle', 'ellipse'].map(t => <option key={t}>{t}</option>)}</select>}{tool === 'eraser' && <><select aria-label="Eraser mode" value={eraserMode} onChange={e => setEraserMode(e.target.value)}><option value="stroke">Whole stroke</option><option value="point">Point eraser</option></select><select aria-label="Eraser size" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))}>{[6, 12, 24, 48].map(n => <option key={n}>{n}</option>)}</select></>}<button className="nb-tool" disabled={!editable} onClick={() => undo.undo()}>Undo ink</button><button className="nb-tool" disabled={!editable} onClick={() => undo.redo()}>Redo ink</button>{hasClipboard && <button className="nb-tool" disabled={!editable} onClick={() => duplicate(clipboard.current)}>Paste canvas items</button>}{rulerVisible && <button className="nb-tool" onClick={() => setRulerVisible(false)}>Hide ruler</button>}{selection.length > 0 && <details className="nb-canvas-actions"><summary>Selection · {selection.length}</summary><div>{selected.length === 1 && <button onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${notebookPageLink(sync.pageId,selected[0].id)}`); setNotice('Drawing link copied.'); } catch { setNotice('Clipboard unavailable. Use the page link and selected drawing ID.'); } }}>Copy drawing link</button>}<button disabled={!editable} onClick={() => duplicate()}>Duplicate</button><button onClick={() => { clipboard.current = structuredClone(selected); setHasClipboard(true); setNotice('Canvas selection copied.'); }}>Copy</button><button disabled={!editable} onClick={() => duplicate(clipboard.current)}>Paste</button><button disabled={!editable} onClick={() => transact(() => selection.forEach(id => root.delete(id)))}>Delete</button><button disabled={!editable} onClick={() => patchSelection({ locked: !selected.every(i => i.locked) })}>Lock / unlock position</button><button disabled={!editable} onClick={() => patchSelection({ groupId: crypto.randomUUID() })}>Group</button><button disabled={!editable} onClick={() => patchSelection({ groupId: null })}>Ungroup</button><button disabled={!editable} onClick={() => patchSelection({ z: Math.min(1000000, Math.max(0, ...items.map(i => i.z)) + 1) })}>Bring to front</button><button disabled={!editable} onClick={() => patchSelection({ z: Math.max(-1000000, Math.min(0, ...items.map(i => i.z)) - 1) })}>Send to back</button><button disabled={!editable} onClick={() => patchSelection({ color })}>Recolor ink / shapes</button><label>Stroke width <select aria-label="Selection stroke width" disabled={!editable} value={selected.find(i => i.type !== 'text')?.type === 'stroke' || selected.find(i => i.type !== 'text')?.type === 'shape' ? (selected.find(i => i.type !== 'text') as Ink | Shape).strokeWidth : 3} onChange={e => patchSelection({ strokeWidth:Number(e.target.value) })}>{[1,2,3,6,12,24,48,64].map(n => <option key={n} value={n}>{n}</option>)}</select></label><label>Shape fill <input aria-label="Selection shape fill" type="color" disabled={!editable || !selected.some(i => i.type === 'shape')} value={(selected.find(i => i.type === 'shape') as Shape | undefined)?.fill ?? color} onChange={e => patchSelection({ fill:e.target.value })}/></label><button disabled={!editable} onClick={() => patchSelection({ fill:null })}>No fill</button></div></details>}</>);
    }, [tool, color, size, shape, eraserMode, eraserSize, selection, items, editable, mobile, undo, onRibbon, rulerVisible, hasClipboard, active]);
    /** Make a text box; once its editor is ready, move the caret's text in
     *  (each line follows auto-capitalize) and, unless the person has moved
     *  on, put the cursor at its end. */
    const createTextBox = (x: number, y: number, fromCaret = false) => {
        const item: TextBox = { ...scopedBase(Math.max(0, x), Math.max(0, y), Math.max(0, ...items.map(i => i.z)) + 1), type: 'text', content: emptyText as TextBox['content'] };
        transact(() => insertCanvasItem(sync.doc, item));
        setSelection([item.id]);
        opening.current = { id: item.id, focus: true };
        let frames = 0;
        const attach = () => {
            if (opening.current?.id !== item.id) return;
            const box = stage.current?.querySelector<HTMLElement & { editor?: Editor }>(`[data-canvas-id="${item.id}"] [role=textbox]`);
            if (!box?.editor && ++frames < 120) { requestAnimationFrame(attach); return; }
            const { focus } = opening.current; opening.current = null;
            const text = fromCaret ? caretText.current : '';
            if (fromCaret) caretText.current = '';
            if (fromCaret) setPending(null);
            if (!box?.editor) return;
            const editor = box.editor, capitalize = autoCapitalizeEnabled();
            const lines = text.split('\n').map(line => capitalize && /^[a-z]/.test(line) ? line[0].toUpperCase() + line.slice(1) : line);
            if (text) editor.commands.setContent({ type: 'doc', content: lines.map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) });
            if (focus) editor.commands.focus('end', { scrollIntoView: false });
            // A single capitalized letter can be put back with Backspace, as when typing in the box.
            if (text.length === 1 && lines[0] !== text) rememberCapital(editor.view, 1, text);
        };
        requestAnimationFrame(attach);
    };
    /** The caret at `at` lost focus or was cancelled. A caret the person has
     *  just placed somewhere else on this canvas is kept. */
    const leaveCaret = (at: { x: number; y: number }) => {
        if (opening.current) opening.current.focus = false; // Keep the text, don't pull focus back.
        else setPending(current => current === at ? null : current);
    };
    /** Text box handles: the dotted bar moves the box, the right edge sets its
     *  width. Both work by pointer (zoom-aware) or keyboard (arrows; Shift = 10). */
    const gripDrag = (item: TextBox, mode: 'move' | 'width') => (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || item.locked || !editable) return;
        e.preventDefault(); e.stopPropagation();
        const el = stage.current!, rect = el.getBoundingClientRect(), scale = el.offsetWidth / rect.width;
        const start = { x: e.clientX, y: e.clientY }, from = { x: item.x, y: item.y, width: item.width };
        const handle = e.currentTarget; handle.setPointerCapture(e.pointerId);
        undo.stopCapturing();
        const move = (ev: PointerEvent) => {
            const dx = (ev.clientX - start.x) * scale, dy = (ev.clientY - start.y) * scale, map = root.get(item.id);
            if (!map) return;
            // One drag is one undo step: capturing stops only at its ends.
            sync.doc.transact(() => {
                if (mode === 'move') { map.set('x', Math.max(0, Math.min(50000, Math.round(from.x + dx)))); map.set('y', Math.max(0, Math.min(50000, Math.round(from.y + dy)))); }
                else map.set('width', Math.max(80, Math.min(4000, Math.round(from.width + dx))));
            }, canvasOrigin);
        };
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); undo.stopCapturing(); };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    };
    const gripKeys = (item: TextBox, mode: 'move' | 'width') => (e: React.KeyboardEvent) => {
        const d = e.shiftKey ? 10 : 1, map = root.get(item.id);
        if (!map || item.locked || !editable) return;
        const delta: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
        const step = delta[e.key]; if (!step || (mode === 'width' && step[0] === 0)) return;
        e.preventDefault(); e.stopPropagation();
        transact(() => {
            if (mode === 'move') { map.set('x', Math.max(0, Math.min(50000, item.x + step[0]))); map.set('y', Math.max(0, Math.min(50000, item.y + step[1]))); }
            else map.set('width', Math.max(80, Math.min(4000, item.width + step[0])));
        });
    };
    const point = (e: React.PointerEvent | PointerEvent | React.MouseEvent): Point => {
        const el = stage.current!, rect = el.getBoundingClientRect();
        const pen = 'pointerType' in e && e.pointerType === 'pen';
        const p: Point = [roundCanvas((e.clientX - rect.left) * el.offsetWidth / rect.width), roundCanvas((e.clientY - rect.top) * el.offsetHeight / rect.height), roundCanvas(pen ? Math.max(.05, (e as PointerEvent).pressure) : .5)];
        return rulerVisible && (tool === 'pen' || tool === 'highlighter') ? snapToRuler(p, ruler) : p;
    };
    const erase = (p: Point) => {
        const removed: string[] = [], replacements: CanvasItem[] = [];
        for (const item of scopedItems()) {
            if (item.type !== 'stroke' || item.locked || !inkHit(item,[p[0],p[1]],eraserSize)) continue;
            removed.push(item.id);
            if (eraserMode === 'point') for (const points of splitInk(item,[p[0],p[1]],eraserSize))
                replacements.push({ ...item,id:crypto.randomUUID(),points });
        }
        try { replaceCanvasItems(sync.doc,removed,replacements,canvasOrigin); }
        catch (e) { setNotice(e instanceof Error ? e.message : 'Cannot erase: canvas is full.'); }
    };
    const begin = (e: React.PointerEvent) => {
        if (!mobile && e.pointerType === 'touch') {
            if (gesture.current?.pointerType === 'pen') return;
            touches.current.set(e.pointerId, { x:e.clientX, y:e.clientY });
            if (touches.current.size === 2) {
                const scroll = stage.current?.closest<HTMLElement>('.nb-paper-scroll');
                if (scroll) {
                    const metrics = touchMetrics();
                    pan.current = { ...metrics, zoom, scroll, left:scroll.scrollLeft, top:scroll.scrollTop };
                    gesture.current = null; setDraft([]);
                    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
                    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); return;
                }
            }
            if (pan.current || touches.current.size > 2) return;
        }
        if (!editable || mobile || e.button !== 0 || tool === 'ruler')
            return;
        if (gesture.current && gesture.current.pointer !== e.pointerId) {
            if (e.pointerType === 'touch') return; // Reject palms during active ink.
            gesture.current = null;
            setDraft([]);
            return;
        }
        const p = point(e), target = (e.target as Element).closest('[data-canvas-id]')?.getAttribute('data-canvas-id');
        if (tool === 'type') {
            const within=(e.target as Element).closest('.nb-flow,.nb-canvas-text');
            if (within?.closest('.nb-canvas-stage')===stage.current && (within.classList.contains('nb-canvas-text') || !scopeId))
                return;
            if (opening.current) return;
            caretText.current = '';
            setPending({ x: p[0], y: p[1] }); setSelection([]);
            return;
        }
        e.preventDefault();
        stage.current?.focus({ preventScroll: true });
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
        gesture.current = { pointer: e.pointerId, pointerType:e.pointerType, tool, start: p, points: [p], originals, resize: (e.target as Element).getAttribute('data-resize') === 'true' };
        if (tool === 'eraser')
            erase(p);
        else
            setDraft([p]);
    };
    const move = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
            touches.current.set(e.pointerId, { x:e.clientX, y:e.clientY });
            if (pan.current) {
                e.preventDefault();
                if (touches.current.size === 2) {
                    const metrics = touchMetrics(), g = pan.current;
                    g.scroll.scrollLeft = g.left + g.x - metrics.x; g.scroll.scrollTop = g.top + g.y - metrics.y;
                    onZoom?.(Math.max(50,Math.min(300,Math.round(g.zoom*metrics.distance/g.distance/5)*5)));
                }
                return;
            }
        }
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
                    const angle = -item.rotation*Math.PI/180, localX = dx*Math.cos(angle)-dy*Math.sin(angle), localY = dx*Math.sin(angle)+dy*Math.cos(angle);
                    const w = Math.max(20, Math.min(50000, item.width + localX)), h = item.type === 'shape' && ['line','arrow'].includes(item.shape) ? item.height : Math.max(20, Math.min(50000, item.height + localY));
                    map.set('width', w);
                    map.set('height', h);
                    if (item.type === 'stroke')
                        map.set('points', item.points.map(p => [roundCanvas(p[0] * w / item.width), roundCanvas(p[1] * h / item.height), p[2]]));
                }
                else {
                    map.set('x', Math.max(0, Math.min(50000, roundCanvas(item.x + dx))));
                    map.set('y', Math.max(0, Math.min(50000, roundCanvas(item.y + dy))));
                }
            } }, canvasOrigin);
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
        if (e.pointerType === 'touch') {
            touches.current.delete(e.pointerId);
            if (pan.current) {
                if (!touches.current.size) pan.current = null;
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                return;
            }
        }
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
                setSelection(items.filter(i => lassoHit(i, g.points)).map(i => i.id));
                setTool('select');
            }
            else if (g.tool === 'pen' || g.tool === 'highlighter') {
                const points = simplifyInk(g.points), x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
                const item: Ink = { ...scopedBase(x, y, Math.max(0, ...items.map(i => i.z)) + 1), type: 'stroke', tool: g.tool, color, strokeWidth: g.tool === 'highlighter' ? Math.min(64, size * 6) : size, opacity: g.tool === 'highlighter' ? .35 : 1, width: Math.max(.1, Math.max(...points.map(p => p[0])) - x), height: Math.max(.1, Math.max(...points.map(p => p[1])) - y), points: points.map(p => [roundCanvas(p[0] - x), roundCanvas(p[1] - y), p[2]]) };
                insertCanvasItem(sync.doc, item,canvasOrigin);
            }
            else if (g.tool === 'shape') {
                let width = Math.max(1, Math.abs(p[0] - g.start[0])), height = Math.max(1, Math.abs(p[1] - g.start[1]));
                if (e.shiftKey)
                    width = height = Math.max(width, height);
                insertCanvasItem(sync.doc, { ...scopedBase(Math.min(g.start[0], p[0]), Math.min(g.start[1], p[1]), Math.max(0, ...items.map(i => i.z)) + 1), type: 'shape', shape, color, fill: null, strokeWidth: size, width, height, ...((shape === 'line' || shape === 'arrow') ? directedLine(g.start, p, e.shiftKey) : {}) },canvasOrigin);
            }
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : 'Cannot save drawing');
        }
        undo.stopCapturing();
    };
    const width = Math.max(0, ...items.map(i => i.x + i.width + 40)), height = Math.max(600, ...items.map(i => i.y + i.height + 40));
    return <div ref={stage} className="nb-canvas-stage" data-tool={mobile ? 'type' : tool} style={{ minWidth: Math.min(50000, width), minHeight: Math.min(50000, height), ...(scopeId ? {} : backgroundStyle(surface.background, surface.picture)) }} onPointerDown={e => { if (scopeId) e.stopPropagation(); onActivate?.(); begin(e); }} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={e => { if (gesture.current?.pointer === e.pointerId) clearGesture(); }} onDoubleClick={e => {
            if (!editable || mobile || tool !== 'type') return;
            const within = (e.target as Element).closest('.nb-flow,.nb-canvas-text');
            if (within?.closest('.nb-canvas-stage') === stage.current && (within.classList.contains('nb-canvas-text') || !scopeId)) return;
            const p = point(e); setPending(null); createTextBox(p[0], p[1]);
        }} onKeyDown={e => {
            if ((e.target as Element).closest('[role=textbox]'))
                return;
            if (e.key === 'Escape') {
                setPending(null);
                clearGesture();
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
            // Keyboard copy / cut / paste / duplicate for selected drawings and boxes.
            const command = (e.ctrlKey || e.metaKey) && !e.altKey ? e.key.toLowerCase() : '';
            if ((command === 'c' || command === 'x') && selection.length) {
                e.preventDefault();
                // Cut takes only what it removes; locked items stay put and aren't copied.
                const movable = selected.filter(i => !i.locked);
                clipboard.current = structuredClone(command === 'x' ? movable : selected); setHasClipboard(clipboard.current.length > 0);
                if (command === 'x') transact(() => movable.forEach(i => root.delete(i.id)));
                setNotice(command === 'x' ? `Cut ${movable.length} ${movable.length === 1 ? 'item' : 'items'}${movable.length < selected.length ? ' (locked items stay)' : ''}. Paste with Ctrl+V.` : `Copied ${selected.length} ${selected.length === 1 ? 'item' : 'items'}. Paste with Ctrl+V.`);
            }
            if (command === 'v' && clipboard.current.length) { e.preventDefault(); duplicate(clipboard.current, 'Pasted'); }
            if (command === 'd' && selection.length) { e.preventDefault(); duplicate(undefined, 'Duplicated'); }
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
    {items.filter(i => i.type !== 'text' && !(i.type === 'stroke' && i.tool === 'highlighter')).map(i => <svg key={i.id} className="nb-canvas-ink" width="100%" height="100%" aria-hidden="true" style={{zIndex:10+items.indexOf(i)}}>{i.type === 'stroke' ? <StrokeView item={i}/> : <ShapeView item={i as Shape}/>}</svg>)}
    {items.filter((i): i is TextBox => i.type === 'text').map(item => <div key={item.id} data-canvas-id={item.id} className={`nb-canvas-text ${selection.includes(item.id) ? 'is-selected' : ''}`} style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height, zIndex: 10 + items.indexOf(item), transform: `rotate(${item.rotation}deg)` }}>{editable && !mobile && tool === 'type' && !item.locked && <><span className="nb-text-grip" role="button" tabIndex={0} aria-label="Move text box (drag, or arrow keys)" title="Drag to move · arrow keys nudge" onPointerDown={gripDrag(item, 'move')} onKeyDown={gripKeys(item, 'move')}/><span className="nb-text-width" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Text box width (drag, or left and right arrow keys)" aria-valuenow={Math.round(item.width)} aria-valuemin={80} aria-valuemax={4000} title="Drag to change the width · left/right arrows" onPointerDown={gripDrag(item, 'width')} onKeyDown={gripKeys(item, 'width')}/></>}<CanvasText item={item} map={root.get(item.id)!} sync={sync} editable={editable && !mobile && tool === 'type'} onFocus={onEditorFocus} onRemoved={onEditorRemoved}/>{editable && !mobile && selection.includes(item.id) && <span data-resize="true" className="nb-canvas-resize"/>}</div>)}
    {!mobile && <svg className="nb-canvas-live" width="100%" height="100%" aria-hidden="true">{draft.length > 0 && <path d={draft.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')} fill="none" stroke={color} strokeWidth={tool === 'highlighter' ? Math.min(64, size * 6) : size} opacity={tool === 'highlighter' ? .35 : 1} strokeLinecap="round"/>}{selected.map(i => <g key={i.id} data-canvas-id={i.id} transform={`translate(${i.x} ${i.y}) rotate(${i.rotation} ${i.width/2} ${i.height/2})`}><rect x={-4} y={-4} width={i.width + 8} height={i.height + 8} fill="none" stroke="#8a6100" strokeWidth="1" strokeDasharray="5 3"/>{editable && !i.locked && <rect data-resize="true" x={i.width-1} y={i.height-1} width={8} height={8} fill="#8a6100" style={{pointerEvents:'all',cursor:'nwse-resize'}}/>}</g>)}</svg>}
    {pending && tool === 'type' && editable && !mobile && <textarea ref={caretInput} className="nb-canvas-caret" style={{ left: pending.x, top: pending.y }} aria-label="Type to add a text box here" rows={1} spellCheck={false}
        onPointerDown={e => e.stopPropagation()}
        onInput={e => { caretText.current = e.currentTarget.value; if (!(e.nativeEvent as InputEvent).isComposing && e.currentTarget.value && !opening.current) createTextBox(pending.x, pending.y, true); }}
        onCompositionEnd={e => { caretText.current = e.currentTarget.value; if (e.currentTarget.value && !opening.current) createTextBox(pending.x, pending.y, true); }}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); leaveCaret(pending); } }}
        onFocus={() => { caretFocusedAt.current = pending; }}
        onBlur={() => { if (caretFocusedAt.current) leaveCaret(caretFocusedAt.current); }}/>}
    {rulerVisible && !mobile && <NotebookRuler value={ruler} onChange={setRuler}/>}{notice && <div className="nb-canvas-notice" role="status">{notice}<button aria-label="Dismiss drawing message" onClick={() => setNotice('')}>×</button></div>}
  </div>;
}
