// Tasks dialogs (Modern): Bruno bulk import and the proof-of-completion
// dialog. Same handlers/props as the Legacy versions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui-kit';
import type { useTasksController } from '../../../components/tasks/useTasksController';
import { notify } from '../../../components/dialog';
import { imageFilesFrom, toWebImage } from '../../../utils/mediaFiles';

type Ctl = ReturnType<typeof useTasksController>;

export function BulkImportDialog({ ctl }: { ctl: Ctl }) {
  const preview = ctl.bulkPreview;
  return (
    <Dialog open={ctl.showBulk} onOpenChange={(o) => { if (!o) ctl.closeBulkModal(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Paste a list</DialogTitle>
          <DialogDescription>Paste meeting notes, a chat log or a to-do dump. Bruno pulls out each task with assignees and due dates — review them before saving.</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <div className="grid gap-2">
            <Label htmlFor="bulk-text" className="sr-only">Notes</Label>
            <Textarea
              id="bulk-text"
              value={ctl.bulkText}
              onChange={(e) => ctl.setBulkText(e.target.value)}
              className="min-h-44 font-mono text-xs"
              placeholder={'- Design intake prototype by Wed — build team\n- Order 2x goBILDA motors before the weekend\n- Sushil to review autonomous pathing code'}
            />
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>Task</TableHead><TableHead className="w-32">Status</TableHead><TableHead className="w-40">Assignee</TableHead><TableHead className="w-36">Due</TableHead><TableHead className="w-10"><span className="sr-only">Remove</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {preview.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="space-y-1">
                      <Input aria-label={`Task ${i + 1} title`} value={row.title || ''} onChange={(e) => ctl.updateBulkRow(i, { title: e.target.value })} className="h-8" />
                      <Input aria-label={`Task ${i + 1} description`} placeholder="Description" value={row.description || ''} onChange={(e) => ctl.updateBulkRow(i, { description: e.target.value })} className="h-8 text-xs" />
                    </TableCell>
                    <TableCell>
                      <Select value={row.status || 'todo'} onValueChange={(v) => ctl.updateBulkRow(i, { status: v })}>
                        <SelectTrigger size="sm" aria-label={`Task ${i + 1} status`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To do</SelectItem>
                          <SelectItem value="in-progress">In progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={row.assigned_to ? String(row.assigned_to) : 'none'} onValueChange={(v) => ctl.updateBulkRow(i, { assigned_to: v === 'none' ? null : Number(v) })}>
                        <SelectTrigger size="sm" aria-label={`Task ${i + 1} assignee`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {ctl.bulkRoster.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="date" aria-label={`Task ${i + 1} due date`} value={row.due_date || ''} onChange={(e) => ctl.updateBulkRow(i, { due_date: e.target.value || null })} className="h-8" /></TableCell>
                    <TableCell><Button variant="ghost" size="icon-sm" aria-label={`Remove task ${i + 1}`} onClick={() => ctl.removeBulkRow(i)}><Trash2 /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {ctl.bulkError && <p role="alert" className="text-sm text-destructive">{ctl.bulkError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={ctl.closeBulkModal}>Cancel</Button>
          {!preview ? (
            <Button disabled={!ctl.bulkText.trim() || ctl.bulkParsing} onClick={() => void ctl.handleBulkParse()}>
              {ctl.bulkParsing ? <Loader2 className="animate-spin" /> : <Sparkles />} Find tasks
            </Button>
          ) : (
            <Button disabled={!preview.length || ctl.bulkSaving} onClick={() => void ctl.handleBulkSave()}>
              {ctl.bulkSaving && <Loader2 className="animate-spin" />} Save {preview.length} task{preview.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MAX_FILES = 5;

/** Proof of completion (Modern). Same props as components/TaskCompletionDialog. */
export function CompletionDialog({ task, notes, onNotesChange, files, onFilesChange, completing, onSubmit, onClose }: {
  task: any; notes: string; onNotesChange: (v: string) => void; files: File[];
  /** A state setter: takes the new list or an update of the current one. */
  onFilesChange: (next: File[] | ((prev: File[]) => File[])) => void;
  completing: boolean; onSubmit: () => void; onClose: () => void;
}) {
  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => { for (const p of previews) URL.revokeObjectURL(p.url); }, [previews]);
  const [dragging, setDragging] = useState(false);
  // Photos still being turned into a web format: they hold a slot, and
  // "Mark done" waits for them so none is silently left out.
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const filesRef = useRef(files);
  filesRef.current = files;
  // Bumped when the dialog closes or moves to another task: a conversion
  // that finishes later is dropped instead of landing in the wrong task.
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; pendingRef.current = 0; setPending(0); }, [task?.id]);
  const changePending = (by: number) => { pendingRef.current += by; setPending(pendingRef.current); };
  // Pasted, dropped or picked photos, as formats every browser can show
  // (an iPhone HEIC is turned into a JPEG when this browser can read it).
  // Only as many as there are free slots, one at a time.
  const addFiles = async (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    const slots = Math.max(0, MAX_FILES - filesRef.current.length - pendingRef.current);
    if (images.length > slots) notify(`Up to ${MAX_FILES} photos per task.`, 'error');
    const take = images.slice(0, slots);
    if (!take.length) return;
    const gen = generation.current;
    changePending(take.length);
    let failed = 0;
    for (const file of take) {
      const ready = await toWebImage(file);
      if (generation.current !== gen) return;
      changePending(-1);
      if (ready) onFilesChange((prev) => (prev.length < MAX_FILES ? [...prev, ready] : prev));
      else failed += 1;
    }
    if (failed) notify("Some photos are in a format browsers can't show (like HEIC). Save them as JPEG or PNG, or paste a screenshot.", 'error');
  };
  const valid = (notes.trim().length > 0 || files.length > 0) && pending === 0;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !completing) onClose(); }}>
      <DialogContent
        onPaste={(e: React.ClipboardEvent) => {
          const imgs = imageFilesFrom(e.clipboardData);
          if (imgs.length) { e.preventDefault(); void addFiles(imgs); }
        }}
        onDragOver={(e: React.DragEvent) => { if (Array.from(e.dataTransfer?.types || []).includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e: React.DragEvent) => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={(e: React.DragEvent) => {
          const imgs = imageFilesFrom(e.dataTransfer);
          setDragging(false);
          if (imgs.length) { e.preventDefault(); void addFiles(imgs); }
        }}
        className={dragging ? 'ring-2 ring-accent' : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" /> {task?.completion_mode === 'each' && !task?.__whole ? 'Mark your part done' : task?.__whole ? 'Finish for everyone' : 'Complete task'}</DialogTitle>
          <DialogDescription className="line-clamp-2">“{task?.title}” — add a short note or a photo as proof.{task?.completion_mode === 'each' && !task?.__whole ? ' Everyone assigned does their own; it’s done when all have.' : ''}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="complete-notes">What was done?</Label>
          <Textarea id="complete-notes" autoFocus value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="e.g. Mounted both hooks, tested a full climb." />
        </div>
        <div className="grid gap-2">
          <Label>Photos <span className="font-normal text-muted-foreground">(up to {MAX_FILES})</span></Label>
          <p className="text-xs text-muted-foreground">Paste a screenshot with {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘V' : 'Ctrl+V'}, drop photos here, or pick them.</p>
          <div className="flex flex-wrap gap-2">
            {previews.map((p, i) => (
              <div key={p.url} className="relative size-16 overflow-hidden rounded-lg border border-border">
                <img src={p.url} alt={`Proof ${i + 1}`} className="size-full object-cover" />
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onFilesChange((prev) => prev.filter((f) => f !== p.file))}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"><X className="size-3" /></button>
              </div>
            ))}
            {Array.from({ length: pending }, (_, i) => (
              <div key={`pending-${i}`} role="status" aria-label="Preparing photo" className="flex size-16 items-center justify-center rounded-lg border border-border bg-muted">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ))}
            {files.length + pending < MAX_FILES && (
              <label className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted">
                <ImagePlus className="size-4" /> Add
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={completing}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!valid || completing}>{(completing || pending > 0) && <Loader2 className="animate-spin" />} {pending > 0 ? 'Preparing photos…' : 'Mark done'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
