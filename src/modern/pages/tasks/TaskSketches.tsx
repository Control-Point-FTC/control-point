// Sketches on a task: a quick drawing board with the notebook's ink (pen and
// highlighter, its colours, pressure-shaped strokes) for the geometry, wiring or
// field plan behind a task. Anyone who can see the task adds one; the author or
// a task manager edits or removes it. Saved as strokes, so it stays editable.
import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Highlighter, Pen, PenLine, Plus, Trash2, Undo2 } from 'lucide-react';
import { inkPath, simplifyInk } from '../../../notebook/canvasGeometry';
import { confirmDialog, notify } from '../../../components/dialog';
import { apiFetch } from '../../../services/api';
import { cn } from '../../../components/cn';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { MAX_SKETCH_POINTS, MAX_SKETCH_STROKES, MAX_SKETCH_TITLE, MAX_SKETCHES_PER_TASK, SKETCH_COLORS, SKETCH_H, SKETCH_W, SKETCH_WIDTHS, type SketchStroke } from '../../../types/taskSketch';

export type TaskSketch = { id: number; member_id: number | null; title: string; strokes: SketchStroke[]; created_at: string; updated_at: string | null };

// Paper stays light in dark mode too, so ink reads the same everywhere (white ink would vanish).
const PAPER = '#fbfaf7';
const COLORS = SKETCH_COLORS.filter((c) => c !== '#ffffff');
const COLOR_NAMES: Record<string, string> = { '#111111': 'Black', '#e63946': 'Red', '#f28c28': 'Orange', '#f5ce36': 'Yellow', '#2caa65': 'Green', '#2587db': 'Blue', '#9457c7': 'Purple' };

function StrokePath({ s }: { s: SketchStroke }) {
  const hl = s.tool === 'highlighter';
  const d = inkPath({ points: s.points, strokeWidth: hl ? s.width * 3 : s.width, tool: s.tool });
  return <path d={d} fill={hl ? 'none' : s.color} stroke={hl ? s.color : 'none'} strokeWidth={hl ? s.width * 3 : undefined} strokeLinecap="round" strokeLinejoin="round" opacity={hl ? 0.35 : 1} />;
}

/** The drawing, read-only (thumbnails and the viewer). */
export function SketchView({ strokes, className, label }: { strokes: SketchStroke[]; className?: string; label: string }) {
  return (
    <svg viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`} role="img" aria-label={label} className={cn('block h-auto w-full rounded-md border border-border', className)} style={{ background: PAPER }}>
      {strokes.map((s, i) => <StrokePath key={i} s={s} />)}
    </svg>
  );
}

/** Draw (new) or redraw (existing) a sketch. */
function SketchPad({ open, onOpenChange, initial, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: { title: string; strokes: SketchStroke[] } | null;
  onSave: (title: string, strokes: SketchStroke[]) => Promise<boolean>;
}) {
  const [strokes, setStrokes] = useState<SketchStroke[]>(initial?.strokes ?? []);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tool, setTool] = useState<'pen' | 'highlighter'>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState<number>(SKETCH_WIDTHS[1]);
  const [live, setLive] = useState<SketchStroke | null>(null);
  const [saving, setSaving] = useState(false);
  const board = useRef<SVGSVGElement>(null);
  const drawing = useRef<SketchStroke | null>(null);
  // One pointer draws at a time: a resting palm or second finger is ignored until the stroke ends.
  const pointer = useRef<number | null>(null);
  // What the server will take (shared limits): the board stops short of them and says so.
  const usedPoints = strokes.reduce((n, s) => n + s.points.length, 0);
  // A stroke needs two points, so one point of room left is full too.
  const full = strokes.length >= MAX_SKETCH_STROKES || usedPoints > MAX_SKETCH_POINTS - 2;

  const at = (e: React.PointerEvent): [number, number, number] => {
    const r = board.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * SKETCH_W;
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * SKETCH_H;
    // Mice report 0.5 while pressed (or 0); pens report real pressure.
    const p = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, p];
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || pointer.current !== null || full) return;
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = { tool, color, width, points: [at(e)] };
    setLive(drawing.current);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current || e.pointerId !== pointer.current) return;
    // Room left on the board: the stroke stops growing there instead of making the sketch unsaveable.
    if (usedPoints + drawing.current.points.length >= MAX_SKETCH_POINTS) return;
    drawing.current = { ...drawing.current, points: [...drawing.current.points, at(e)] };
    setLive(drawing.current);
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    const s = drawing.current;
    drawing.current = null;
    setLive(null);
    if (!s) return;
    // A tap is a dot: give it a second point so it has a shape.
    const pts = (s.points.length === 1 ? [s.points[0], [s.points[0][0] + 0.5, s.points[0][1] + 0.5, s.points[0][2]] as [number, number, number]] : simplifyInk(s.points))
      .slice(0, Math.max(0, MAX_SKETCH_POINTS - usedPoints));
    if (pts.length < 2) return;
    setStrokes((list) => [...list, { ...s, points: pts }]);
  };
  const undo = () => setStrokes((list) => list.slice(0, -1));

  const save = async () => {
    if (!strokes.length || saving) return;
    setSaving(true);
    try { if (await onSave(title, strokes)) onOpenChange(false); }
    catch { notify('Could not save the sketch — check your connection and try again. Your drawing is still here.', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" onKeyDown={(e) => {
        // In the title box, Ctrl/⌘ + Z is the browser's text undo.
        if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      }}>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit sketch' : 'New sketch'}</DialogTitle>
          <DialogDescription>Draw with a mouse, finger or pen. Ctrl/⌘ + Z undoes the last stroke.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sketch-title">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="sketch-title" value={title} maxLength={MAX_SKETCH_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Intake roller spacing" />
          </div>
          <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant={tool === 'pen' ? 'default' : 'outline'} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}><Pen /> Pen</Button>
            <Button type="button" size="sm" variant={tool === 'highlighter' ? 'default' : 'outline'} aria-pressed={tool === 'highlighter'} onClick={() => setTool('highlighter')}><Highlighter /> Highlighter</Button>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={COLOR_NAMES[c] ?? c} aria-pressed={color === c} onClick={() => setColor(c)}
                className={cn('size-7 rounded-full border-2 transition-transform', color === c ? 'scale-110 border-foreground' : 'border-border')} style={{ background: c }} />
            ))}
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            {SKETCH_WIDTHS.map((w, i) => (
              <button key={w} type="button" aria-label={['Thin', 'Medium', 'Thick'][i]} aria-pressed={width === w} onClick={() => setWidth(w)}
                className={cn('flex size-8 items-center justify-center rounded-md border', width === w ? 'border-accent bg-accent/15' : 'border-border')}>
                <span className="rounded-full bg-foreground" style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
            <span className="ml-auto flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" disabled={!strokes.length} onClick={undo}><Undo2 /> Undo</Button>
              <Button type="button" size="sm" variant="ghost" disabled={!strokes.length} onClick={() => setStrokes([])}><Trash2 /> Clear</Button>
            </span>
          </div>
          <svg
            ref={board}
            viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
            role="img"
            aria-label={`Drawing board, ${strokes.length} stroke${strokes.length === 1 ? '' : 's'}`}
            className="block h-auto w-full cursor-crosshair touch-none select-none rounded-md border border-border"
            style={{ background: PAPER }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {strokes.map((s, i) => <StrokePath key={i} s={s} />)}
            {live && <StrokePath s={live} />}
          </svg>
          {full && <p role="status" className="text-xs text-destructive">This sketch is as big as one can be. Save it, or Undo a few strokes to keep drawing.</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!strokes.length || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save sketch'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The task sheet's Sketches section. */
export function TaskSketches({ taskId, sketches, reload, members, currentUserId, canModerate }: {
  taskId: number;
  sketches: TaskSketch[];
  reload: () => Promise<void>;
  members: any[];
  currentUserId?: number;
  canModerate: boolean;
}) {
  const [editing, setEditing] = useState<TaskSketch | 'new' | null>(null);
  // The open sketch by id, read from the live list (a teammate's edit shows; a removal closes it).
  const [viewingId, setViewingId] = useState<number | null>(null);
  const viewing = viewingId == null ? null : sketches.find((s) => s.id === viewingId) ?? null;
  useEffect(() => { if (viewingId != null && !sketches.some((s) => s.id === viewingId)) setViewingId(null); }, [sketches, viewingId]);
  const nameOf = (id: number | null) => members.find((m: any) => Number(m.id) === Number(id))?.name || 'Someone';
  const canChange = (s: TaskSketch) => canModerate || (currentUserId != null && Number(s.member_id) === Number(currentUserId));
  const full = sketches.length >= MAX_SKETCHES_PER_TASK;

  const save = async (title: string, strokes: SketchStroke[]) => {
    const existing = editing && editing !== 'new' ? editing : null;
    const res = await apiFetch(existing ? `/api/tasks/${taskId}/sketches/${existing.id}` : `/api/tasks/${taskId}/sketches`, {
      method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, strokes }),
    });
    if (!res.ok) { notify((await res.json().catch(() => ({})))?.error || 'Could not save the sketch.', 'error'); return false; }
    await reload();
    return true;
  };
  const remove = async (s: TaskSketch) => {
    if (!(await confirmDialog({ title: 'Remove this sketch?', message: s.title ? `"${s.title}" will be removed from the task.` : 'The sketch will be removed from the task.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/sketches/${s.id}`, { method: 'DELETE' });
      if (!res.ok) { notify((await res.json().catch(() => ({})))?.error || 'Could not remove the sketch.', 'error'); return; }
    } catch {
      notify('Could not remove the sketch — check your connection and try again.', 'error');
      return;
    }
    setViewingId(null);
    await reload();
  };

  return (
    <section aria-label="Sketches" className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="flex-1">Sketches {sketches.length > 0 && <span className="font-normal text-muted-foreground">{sketches.length}</span>}</Label>
        <Button type="button" size="sm" variant="outline" disabled={full} title={full ? `A task holds up to ${MAX_SKETCHES_PER_TASK} sketches` : undefined} onClick={() => setEditing('new')}><Plus /> New sketch</Button>
      </div>
      {sketches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sketches yet. Draw the geometry, wiring or field plan behind this task.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sketches.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setViewingId(s.id)} className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                <SketchView strokes={s.strokes} label={`Sketch${s.title ? ` "${s.title}"` : ''} by ${nameOf(s.member_id)}`} />
                <span className="mt-1 block truncate text-xs font-medium">{s.title || 'Untitled sketch'}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{nameOf(s.member_id)} · {format(new Date(s.updated_at || s.created_at), 'MMM d')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewingId(null); }}>
        {viewing && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{viewing.title || 'Untitled sketch'}</DialogTitle>
              <DialogDescription>By {nameOf(viewing.member_id)} · {format(new Date(viewing.created_at), 'MMM d, h:mm a')}{viewing.updated_at ? ` · edited ${format(new Date(viewing.updated_at), 'MMM d')}` : ''}</DialogDescription>
            </DialogHeader>
            <SketchView strokes={viewing.strokes} label={`Sketch${viewing.title ? ` "${viewing.title}"` : ''}`} />
            {canChange(viewing) && (
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => void remove(viewing)}><Trash2 /> Remove</Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(viewing); setViewingId(null); }}><PenLine /> Edit</Button>
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>
      {editing && (
        <SketchPad
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          initial={editing === 'new' ? null : { title: editing.title, strokes: editing.strokes }}
          onSave={save}
        />
      )}
    </section>
  );
}
