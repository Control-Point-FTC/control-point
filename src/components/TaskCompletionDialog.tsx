import { useEffect, useMemo } from 'react';
import { X, CheckCircle2, Loader2, ImagePlus } from 'lucide-react';
import { Card, Button } from './ui';

interface TaskCompletionDialogProps {
  task: any;
  notes: string;
  onNotesChange: (v: string) => void;
  files: File[];
  onFilesChange: (f: File[]) => void;
  completing: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

const MAX_FILES = 5;

function imagesFromClipboard(e: React.ClipboardEvent): File[] {
  const out: File[] = [];
  try {
    const items = e.clipboardData?.items;
    if (!items) return out;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  } catch { /* clipboard without image items */ }
  return out;
}

/** Shared proof-of-completion dialog. Every path that moves a task to Done
 *  (dashboard, Tasks list, Kanban board, context menu) opens this instead of
 *  PATCHing the status directly — the server rejects direct done transitions. */
export default function TaskCompletionDialog({
  task, notes, onNotesChange, files, onFilesChange, completing, onSubmit, onClose,
}: TaskCompletionDialogProps) {
  const previews = useMemo(
    () => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [files]
  );
  useEffect(() => () => { for (const p of previews) URL.revokeObjectURL(p.url); }, [previews]);

  const addFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    onFilesChange([...files, ...images].slice(0, MAX_FILES));
  };
  const removeFile = (idx: number) => onFilesChange(files.filter((_, i) => i !== idx));
  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = imagesFromClipboard(e);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const valid = notes.trim().length > 0 || files.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <Card
        title="Mark task done"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e: any) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-text-base -mt-2 truncate">{task.title}</p>
        {!task.assigned_to ? (
          <p className="text-xs text-text-muted">This task is unassigned — it will be assigned to you when you complete it.</p>
        ) : null}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Proof of completion</label>
            <textarea
              value={notes}
              onChange={(e: any) => onNotesChange(e.target.value)}
              onPaste={handlePaste}
              rows={4}
              autoFocus
              placeholder="What was done? Describe it, or paste screenshots here…"
              className="mt-1 w-full min-w-0 bg-elevated border border-text-base/10 rounded-xl px-4 py-3 text-sm text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all resize-y min-h-[96px]"
            />
            <p className="text-[11px] text-text-muted mt-1">Tip: you can paste screenshots straight from your clipboard (Ctrl/⌘+V).</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Screenshots (up to {MAX_FILES})</label>
            <label className="mt-1 flex items-center justify-center gap-2 w-full rounded-xl border border-dashed border-text-base/20 px-4 py-3 text-sm text-text-muted cursor-pointer hover:border-accent/50 hover:text-text-base transition-colors">
              <ImagePlus className="w-4 h-4" />
              {files.length === 0 ? 'Choose images…' : `Add more (${files.length}/${MAX_FILES})`}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e: any) => { addFiles(Array.from(e.target.files || []) as File[]); e.target.value = ''; }}
              />
            </label>
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {previews.map((p, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-text-base/10">
                    <img src={p.url} alt={`Proof ${i + 1}`} className="w-full h-20 object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label={`Remove screenshot ${i + 1}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!valid && (
            <p className="text-xs text-amber-400">Add a short note or at least one screenshot — proof is required to mark a task done.</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={completing}>Cancel</Button>
            <Button onClick={onSubmit} disabled={completing || !valid}>
              {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {completing ? 'Saving…' : 'Mark done'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
