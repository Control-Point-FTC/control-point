// Sticky Notes: a member's own quick scratch notes, independent of any page.
// A list panel opens from the notebook's top bar; each note floats above the
// page as a small card you can move, resize, recolor, close or delete.
//
// Saving is owned here, not by the cards: every change is merged into a
// per-note "unsaved" set and sent one request at a time per note. A failure
// keeps the fields unsaved (Retry resends all of them), and anything still
// waiting is sent when the notebook closes, so drafts survive a card closing,
// a layout switch or leaving the page.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { apiJson } from '../services/api';
import { confirmDialog } from '../components/dialog';
import './sticky.css';

export type StickyNote = { id: number; body: string; color: string; x: number; y: number; width: number; height: number; open: boolean; updatedAt: string };
type Change = Partial<Omit<StickyNote, 'id' | 'updatedAt'>>;
type SaveState = 'saved' | 'saving' | 'failed';
const COLORS: [string, string][] = [['volt', 'Volt'], ['graphite', 'Graphite'], ['sky', 'Sky'], ['mint', 'Mint'], ['rose', 'Rose'], ['sand', 'Sand']];
const SAVE_DELAY = 600;
const CASCADE = 8;
const preview = (body: string) => body.split('\n').find(l => l.trim())?.trim().slice(0, 60) || 'Empty note';

const request = <T,>(path: string, method = 'GET', body?: unknown, keepalive = false) =>
  apiJson<T>(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', keepalive });

/** Keep at least the header of a card on screen, whatever the window size. */
export function clampToWindow(x: number, y: number, width: number) {
  const w = typeof window === 'undefined' ? 1280 : window.innerWidth, h = typeof window === 'undefined' ? 800 : window.innerHeight;
  return { x: Math.max(0, Math.min(x, w - Math.min(width, 160))), y: Math.max(0, Math.min(y, h - 48)) };
}

function useWindowSize() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick(t => t + 1);
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
}

/** One floating note. It shows the parent's values and reports changes. */
function NoteCard({ note, state, onChange, onFlush, onRetry, onClose, onDelete }: { note: StickyNote; state: SaveState; onChange: (change: Change, delay?: number) => void; onFlush: () => void; onRetry: () => void; onClose: () => void; onDelete: () => void }) {
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const report = useRef(onChange); report.current = onChange;
  useWindowSize();
  const at = dragAt ?? clampToWindow(note.x, note.y, note.width);
  // Remember the size the person drags the corner to.
  useEffect(() => {
    const el = card.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let wait: number | undefined;
    const observer = new ResizeObserver(() => { window.clearTimeout(wait); wait = window.setTimeout(() => {
      const width = Math.round(el.offsetWidth), height = Math.round(el.offsetHeight);
      if (Math.abs(width - note.width) > 2 || Math.abs(height - note.height) > 2) report.current({ width: Math.max(160, Math.min(900, width)), height: Math.max(120, Math.min(900, height)) });
    }, 400); });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearTimeout(wait); };
  }, [note.width, note.height]);
  const drag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button,select')) return;
    const start = { x: e.clientX - at.x, y: e.clientY - at.y };
    const target = e.currentTarget as HTMLElement; target.setPointerCapture(e.pointerId);
    const place = (ev: PointerEvent) => clampToWindow(Math.round(ev.clientX - start.x), Math.round(ev.clientY - start.y), note.width);
    const move = (ev: PointerEvent) => setDragAt(place(ev));
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      onChange(place(ev)); setDragAt(null);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };
  const nudge = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const step = e.shiftKey ? 40 : 10, d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = d[e.key]; if (!delta) return;
    e.preventDefault();
    onChange(clampToWindow(at.x + delta[0], at.y + delta[1], note.width));
  };
  return <div ref={card} className="nb-sticky" data-print-hide data-color={note.color} role="dialog" aria-label={`Sticky note: ${preview(note.body)}`}
    style={{ left: at.x, top: at.y, width: note.width, height: note.height }}>
    <header onPointerDown={drag} onKeyDown={nudge} tabIndex={0} aria-label="Move note (arrow keys)" title="Drag to move · arrow keys to nudge">
      <select aria-label="Note color" value={note.color} onChange={e => onChange({ color: e.target.value })}>{COLORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <span className="nb-sticky-state" role="status">{state === 'saving' ? 'Saving…' : state === 'failed' ? 'Not saved' : ''}</span>
      {state === 'failed' && <button type="button" onClick={onRetry}>Retry</button>}
      <button type="button" aria-label="Delete note" title="Delete note" onClick={onDelete}><Trash2 size={14} /></button>
      <button type="button" aria-label="Close note" title="Close note (it stays in the list)" onClick={onClose}><X size={14} /></button>
    </header>
    <textarea aria-label="Note text" value={note.body} maxLength={10000} placeholder="Take a note…" onChange={e => onChange({ body: e.target.value }, SAVE_DELAY)}
      onBlur={onFlush} autoFocus={!note.body} />
  </div>;
}

function readDrafts(key: string | null): Record<string, Change> {
  if (!key) return {};
  try { const v = JSON.parse(localStorage.getItem(key) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

/** Mounted for the whole notebook session; `hidden` (e.g. the phone layout)
 *  hides the panel and cards without dropping unsaved changes. Unsaved
 *  changes are also kept on this device (per account and workspace, given
 *  `scope`) until the server confirms them, and offered again next time. */
export function StickyNotes({ open, onClose, hidden = false, scope }: { open: boolean; onClose: () => void; hidden?: boolean; scope?: string }) {
  const draftsKey = scope ? `cp-sticky-drafts:${scope}` : null;
  const [notes, setNotes] = useState<StickyNote[] | null>(null);
  const [error, setError] = useState('');
  const [states, setStates] = useState<Record<number, SaveState>>({});
  const unsaved = useRef(new Map<number, Change>());
  const sending = useRef(new Map<number, Change>());
  const timers = useRef(new Map<number, number>());
  const failed = useRef(new Set<number>());
  const mark = (id: number, state: SaveState) => setStates(s => s[id] === state ? s : { ...s, [id]: state });
  // Notes whose draft entry this tab is responsible for. Other tabs' entries
  // are left alone; an entry is removed only once this tab has saved it.
  const touched = useRef(new Set<number>());
  const keepDrafts = useCallback((gone: number[] = []) => {
    if (!draftsKey) return;
    const drafts = readDrafts(draftsKey);
    for (const id of gone) delete drafts[id];
    for (const id of [...touched.current]) {
      if (sending.current.has(id) || unsaved.current.has(id)) drafts[id] = { ...sending.current.get(id), ...unsaved.current.get(id) };
      else { delete drafts[id]; touched.current.delete(id); }
    }
    try { if (Object.keys(drafts).length) localStorage.setItem(draftsKey, JSON.stringify(drafts)); else localStorage.removeItem(draftsKey); } catch { /* storage optional */ }
  }, [draftsKey]);

  const load = useCallback(async () => {
    let list: StickyNote[];
    try { list = await request<StickyNote[]>('/api/sticky-notes'); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your sticky notes.'); return; }
    // Put back changes that never reached the server, then send them.
    const drafts = readDrafts(draftsKey);
    setNotes(list.map(n => drafts[n.id] ? { ...n, ...drafts[n.id] } : n));
    for (const n of list) if (drafts[n.id] && !unsaved.current.has(n.id) && !sending.current.has(n.id)) {
      touched.current.add(n.id); unsaved.current.set(n.id, drafts[n.id]); void flush(n.id);
    }
    // Drafts for notes that no longer exist can't be saved anywhere.
    keepDrafts(Object.keys(drafts).map(Number).filter(id => !list.some(n => n.id === id)));
  }, [draftsKey, keepDrafts]); // eslint-disable-line react-hooks/exhaustive-deps -- flush is stable
  useEffect(() => {
    if (!hidden && notes === null && (open || Object.keys(readDrafts(draftsKey)).length)) void load();
  }, [open, hidden, notes, load, draftsKey]);
  // Bruno changed sticky notes (a confirmed card): show the server's notes,
  // keeping any local edits that haven't been saved yet on top.
  useEffect(() => {
    const onChange = (e: Event) => {
      const types = (e as CustomEvent<{ types?: string[] }>).detail?.types;
      if (!Array.isArray(types) || !types.includes('sticky')) return;
      void request<StickyNote[]>('/api/sticky-notes').then(list => {
        setNotes(prev => prev === null ? prev : list.map(n => ({ ...n, ...sending.current.get(n.id), ...unsaved.current.get(n.id) })));
      }).catch(() => { /* the next open reloads */ });
    };
    window.addEventListener('bruno-data-changed', onChange);
    return () => window.removeEventListener('bruno-data-changed', onChange);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (e.target as Element)?.closest?.('.nb-sticky-panel')) onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** Send everything unsaved for one note; one request in flight per note. */
  const flush = useCallback(async (id: number) => {
    window.clearTimeout(timers.current.get(id)); timers.current.delete(id);
    const change = unsaved.current.get(id);
    if (!change || sending.current.has(id)) return;
    unsaved.current.delete(id); sending.current.set(id, change); mark(id, 'saving'); keepDrafts();
    try {
      const saved = await request<StickyNote>(`/api/sticky-notes/${id}`, 'PATCH', change);
      failed.current.delete(id);
      setNotes(list => list?.map(n => n.id === id ? { ...n, updatedAt: saved.updatedAt } : n) ?? list);
    } catch {
      // Newer edits win over the ones that failed; all of them stay unsaved.
      unsaved.current.set(id, { ...change, ...unsaved.current.get(id) });
      failed.current.add(id);
    } finally { sending.current.delete(id); keepDrafts(); }
    if (failed.current.has(id)) mark(id, 'failed');
    else if (unsaved.current.has(id)) void flush(id);
    else mark(id, 'saved');
  }, [keepDrafts]);

  const change = useCallback((id: number, next: Change, delay = 0) => {
    setNotes(list => list?.map(n => n.id === id ? { ...n, ...next } : n) ?? list);
    unsaved.current.set(id, { ...unsaved.current.get(id), ...next }); touched.current.add(id); keepDrafts();
    mark(id, failed.current.has(id) ? 'failed' : 'saving');
    window.clearTimeout(timers.current.get(id));
    if (failed.current.has(id)) return; // Wait for Retry instead of hammering a failing server.
    timers.current.set(id, window.setTimeout(() => { void flush(id); }, delay));
  }, [flush, keepDrafts]);
  const retry = useCallback((id: number) => { failed.current.delete(id); void flush(id); }, [flush]);

  // Leaving the notebook (or closing the tab) is the last chance to save:
  // send everything waiting, including failed changes and anything whose
  // request is still in flight (its answer may never arrive), with keepalive.
  // Changes stay unsaved (and kept on this device) until a save succeeds.
  useEffect(() => {
    const sent = new WeakSet<Change>();
    const sendAll = () => {
      keepDrafts();
      for (const [id, change] of [...unsaved.current]) {
        if (sent.has(change)) continue; // pagehide, then unmount: once is enough.
        sent.add(change);
        window.clearTimeout(timers.current.get(id)); timers.current.delete(id);
        void request(`/api/sticky-notes/${id}`, 'PATCH', { ...sending.current.get(id), ...change }, true).then(() => {
          if (unsaved.current.get(id) !== change) return; // Edited again since; that edit is still queued.
          unsaved.current.delete(id); failed.current.delete(id); keepDrafts();
          if (!sending.current.has(id)) mark(id, 'saved');
        }, () => { failed.current.add(id); mark(id, 'failed'); });
      }
    };
    window.addEventListener('pagehide', sendAll);
    return () => { window.removeEventListener('pagehide', sendAll); sendAll(); };
  }, [keepDrafts]);

  const create = async () => {
    if (!notes) return;
    const offset = (notes.filter(n => n.open).length % CASCADE) * 24;
    const at = clampToWindow(360 + offset, 140 + offset, 260);
    try { const note = await request<StickyNote>('/api/sticky-notes', 'POST', at); setNotes(list => [note, ...(list ?? [])]); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a note.'); }
  };
  const remove = async (note: StickyNote) => {
    if (note.body.trim() && !await confirmDialog({ title: 'Delete this sticky note?', message: `“${preview(note.body)}” will be deleted permanently.`, confirmLabel: 'Delete', danger: true })) return;
    try {
      await request(`/api/sticky-notes/${note.id}`, 'DELETE');
      window.clearTimeout(timers.current.get(note.id)); timers.current.delete(note.id);
      unsaved.current.delete(note.id); failed.current.delete(note.id); keepDrafts([note.id]);
      setNotes(list => list?.filter(n => n.id !== note.id) ?? list);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the note.'); }
  };
  if (hidden) return null;
  return <>
    {open && <aside className="nb-sticky-panel" data-print-hide role="complementary" aria-label="Sticky notes">
      <header><h2>Sticky notes</h2><button type="button" aria-label="Close sticky notes" onClick={onClose}><X size={16} /></button></header>
      <p className="nb-small">Just for you. Not part of any notebook page.</p>
      <button type="button" className="nb-sticky-new" disabled={notes === null} onClick={() => { void create(); }}><Plus size={15} /> New note</button>
      {error && <p role="alert" className="nb-small">{error} {notes === null && <button type="button" onClick={() => { void load(); }}>Retry</button>}</p>}
      {notes === null && !error && <p role="status" className="nb-small">Loading…</p>}
      {notes && !notes.length && <p className="nb-small">No sticky notes yet.</p>}
      <ul>{notes?.map(n => <li key={n.id}><button type="button" data-color={n.color} aria-pressed={n.open} onClick={() => change(n.id, { open: !n.open })}>
        <strong>{preview(n.body)}</strong><span>{new Date(n.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{n.open ? ' · open' : ''}{states[n.id] === 'failed' ? ' · not saved' : ''}</span>
      </button></li>)}</ul>
    </aside>}
    {notes?.filter(n => n.open).map(n => <NoteCard key={n.id} note={n} state={states[n.id] ?? 'saved'}
      onChange={(next, delay) => change(n.id, next, delay)} onRetry={() => retry(n.id)}
      onFlush={() => { if (!failed.current.has(n.id)) void flush(n.id); }}
      onClose={() => change(n.id, { open: false })} onDelete={() => { void remove(n); }} />)}
  </>;
}
