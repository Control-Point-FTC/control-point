// Sticky Notes: a member's own quick scratch notes, independent of any page.
// A list panel opens from the notebook's top bar; each note floats above the
// page as a small card you can move, resize, recolor, close or delete. Text
// saves on its own (debounced), with honest saving/failed states.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { apiJson } from '../services/api';
import { confirmDialog } from '../components/dialog';

export type StickyNote = { id: number; body: string; color: string; x: number; y: number; width: number; height: number; open: boolean; updatedAt: string };
type SaveState = 'saved' | 'saving' | 'failed';
const COLORS: [string, string][] = [['volt', 'Volt'], ['graphite', 'Graphite'], ['sky', 'Sky'], ['mint', 'Mint'], ['rose', 'Rose'], ['sand', 'Sand']];
const SAVE_DELAY = 600;
const preview = (body: string) => body.split('\n').find(l => l.trim())?.trim().slice(0, 60) || 'Empty note';

const request = <T,>(path: string, method = 'GET', body?: unknown) =>
  apiJson<T>(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });

/** One floating note. Text and geometry changes are saved after a pause. */
function NoteCard({ note, onChange, onClose, onDelete }: { note: StickyNote; onChange: (patch: Partial<StickyNote>) => Promise<boolean>; onClose: () => void; onDelete: () => void }) {
  const [text, setText] = useState(note.body);
  const [state, setState] = useState<SaveState>('saved');
  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const timer = useRef<number | undefined>(undefined);
  const card = useRef<HTMLDivElement>(null);
  const save = useCallback(async (patch: Partial<StickyNote>) => { setState('saving'); setState(await onChange(patch) ? 'saved' : 'failed'); }, [onChange]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const edit = (value: string) => {
    setText(value); setState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void save({ body: value }); }, SAVE_DELAY);
  };
  // Remember the size the person drags the corner to.
  useEffect(() => {
    const el = card.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let wait: number | undefined;
    const observer = new ResizeObserver(() => { window.clearTimeout(wait); wait = window.setTimeout(() => {
      const width = Math.round(el.offsetWidth), height = Math.round(el.offsetHeight);
      if (Math.abs(width - note.width) > 2 || Math.abs(height - note.height) > 2) void save({ width: Math.max(160, Math.min(900, width)), height: Math.max(120, Math.min(900, height)) });
    }, 400); });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearTimeout(wait); };
  }, [note.width, note.height, save]);
  const drag = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('button,select')) return;
    const start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const target = e.currentTarget as HTMLElement; target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setPos({ x: Math.max(0, ev.clientX - start.x), y: Math.max(0, ev.clientY - start.y) });
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up);
      void save({ x: Math.round(Math.max(0, ev.clientX - start.x)), y: Math.round(Math.max(0, ev.clientY - start.y)) });
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
  };
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10, d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = d[e.key]; if (!delta) return;
    e.preventDefault();
    const next = { x: Math.max(0, pos.x + delta[0]), y: Math.max(0, pos.y + delta[1]) };
    setPos(next); void save(next);
  };
  return <div ref={card} className="nb-sticky" data-color={note.color} role="dialog" aria-label={`Sticky note: ${preview(text)}`}
    style={{ left: pos.x, top: pos.y, width: note.width, height: note.height }}>
    <header onPointerDown={drag} onKeyDown={nudge} tabIndex={0} aria-label="Move note (arrow keys)" title="Drag to move · arrow keys to nudge">
      <select aria-label="Note color" value={note.color} onChange={e => { void save({ color: e.target.value }); }}>{COLORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <span className="nb-sticky-state" role="status">{state === 'saving' ? 'Saving…' : state === 'failed' ? 'Not saved' : ''}</span>
      {state === 'failed' && <button type="button" onClick={() => { void save({ body: text }); }}>Retry</button>}
      <button type="button" aria-label="Delete note" title="Delete note" onClick={onDelete}><Trash2 size={14} /></button>
      <button type="button" aria-label="Close note" title="Close note (it stays in the list)" onClick={onClose}><X size={14} /></button>
    </header>
    <textarea aria-label="Note text" value={text} maxLength={10000} placeholder="Take a note…" onChange={e => edit(e.target.value)}
      onBlur={() => { if (state === 'saving') { window.clearTimeout(timer.current); void save({ body: text }); } }} autoFocus={!note.body} />
  </div>;
}

export function StickyNotes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState<StickyNote[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setNotes(await request<StickyNote[]>('/api/sticky-notes')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your sticky notes.'); }
  }, []);
  useEffect(() => { if (open && notes === null) void load(); }, [open, notes, load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (e.target as Element)?.closest?.('.nb-sticky-panel')) onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const patch = useCallback(async (id: number, change: Partial<StickyNote>) => {
    setNotes(list => list?.map(n => n.id === id ? { ...n, ...change } : n) ?? list);
    try { const saved = await request<StickyNote>(`/api/sticky-notes/${id}`, 'PATCH', change); setNotes(list => list?.map(n => n.id === id ? { ...n, ...saved, body: change.body ?? n.body } : n) ?? list); return true; }
    catch { return false; }
  }, []);
  const create = async () => {
    const offset = (notes?.filter(n => n.open).length ?? 0) * 24;
    try { const note = await request<StickyNote>('/api/sticky-notes', 'POST', { x: Math.min(window.innerWidth - 300, 360 + offset), y: 140 + offset }); setNotes(list => [note, ...(list ?? [])]); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a note.'); }
  };
  const remove = async (note: StickyNote) => {
    if (note.body.trim() && !await confirmDialog({ title: 'Delete this sticky note?', message: `“${preview(note.body)}” will be deleted permanently.`, confirmLabel: 'Delete', danger: true })) return;
    try { await request(`/api/sticky-notes/${note.id}`, 'DELETE'); setNotes(list => list?.filter(n => n.id !== note.id) ?? list); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the note.'); }
  };
  return <>
    {open && <aside className="nb-sticky-panel" role="complementary" aria-label="Sticky notes">
      <header><h2>Sticky notes</h2><button type="button" aria-label="Close sticky notes" onClick={onClose}><X size={16} /></button></header>
      <p className="nb-small">Just for you. Not part of any notebook page.</p>
      <button type="button" className="nb-sticky-new" onClick={() => { void create(); }}><Plus size={15} /> New note</button>
      {error && <p role="alert" className="nb-small">{error} <button type="button" onClick={() => { void load(); }}>Retry</button></p>}
      {notes === null && !error && <p role="status" className="nb-small">Loading…</p>}
      {notes && !notes.length && <p className="nb-small">No sticky notes yet.</p>}
      <ul>{notes?.map(n => <li key={n.id}><button type="button" data-color={n.color} aria-pressed={n.open} onClick={() => { void patch(n.id, { open: !n.open }); }}>
        <strong>{preview(n.body)}</strong><span>{new Date(n.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{n.open ? ' · open' : ''}</span>
      </button></li>)}</ul>
    </aside>}
    {notes?.filter(n => n.open).map(n => <NoteCard key={n.id} note={n} onChange={change => patch(n.id, change)} onClose={() => { void patch(n.id, { open: false }); }} onDelete={() => { void remove(n); }} />)}
  </>;
}
