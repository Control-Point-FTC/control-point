// Confirm card for Bruno's proposed notebook changes. What it shows comes from
// the server (resolved under Bruno's access, so protected pages appear only as
// "unavailable"), never from the model's own description. Deletions need an
// explicit tick before the button unlocks.
import { useEffect, useState } from 'react';
import { Check, Loader2, NotebookPen, StickyNote, Trash2, Undo2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../cn';
import { Button } from '../ui-kit';
import { applyNotebookOps, canUndoNotebookResults, isStickyOp, newReceiptKey, previewNotebookOps, undoNotebookOps, type NotebookOpPreview, type NotebookOpResult } from '../../services/notebookProposals';
import { setStickyNotesOpen } from '../../notebook/stickyNotesState';

type State = { status: 'loading' | 'pending' | 'confirming' | 'done' | 'dismissed' | 'error'; error?: string };
type Memory = { receipt?: string; results?: NotebookOpResult[]; undone?: boolean };

/** Session-scoped record of one card (falls back to memory when storage is blocked). */
const fallback = new Map<string, Memory>();
function cardMemory(identity: string) {
  let h = 2166136261;
  for (let i = 0; i < identity.length; i++) { h ^= identity.charCodeAt(i); h = Math.imul(h, 16777619); }
  const key = `cp-bruno-notebook-card:${(h >>> 0).toString(36)}:${identity.length}`;
  return {
    read(): Memory { try { const v = sessionStorage.getItem(key); if (v) return JSON.parse(v); } catch { /* storage optional */ } return fallback.get(key) ?? {}; },
    write(value: Memory): Memory { fallback.set(key, value); try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage optional */ } return value; },
  };
}

/** `scope` identifies the reply this card belongs to (its position and text).
 *  The receipt and outcome are kept per reply for the tab's session, so
 *  closing and reopening the chat never confirms the same change twice. */
export function NotebookProposalCard({ ops, scope, auto = false, onAsk, askDisabled = false }: {
  ops: Record<string, unknown>[]; scope: string;
  /** Auto-apply is on and this reply just finished: apply without the click (never a deletion). */
  auto?: boolean;
  /** Sends a message in this chat (the redo button when the page moved under the card). */
  onAsk?: (text: string) => void;
  /** Bruno is still answering: the redo message would be dropped, so wait. */
  askDisabled?: boolean;
}) {
  const opsKey = JSON.stringify(ops);
  // A card is either page changes or the member's own sticky notes.
  const sticky = ops.length > 0 && ops.every(isStickyOp);
  const noun = sticky ? 'sticky note' : 'notebook';
  // Created once per card, not on every render.
  const [memory] = useState(() => cardMemory(`${scope}\u0000${opsKey}`));
  const [previews, setPreviews] = useState<NotebookOpPreview[] | null>(null);
  const [state, setState] = useState<State>(() => memory.read().results ? { status: 'done' } : { status: 'loading' });
  const [results, setResults] = useState<NotebookOpResult[]>(() => memory.read().results ?? []);
  const [deleteOk, setDeleteOk] = useState(false);
  // Undo for an applied page card: idle, running, done, or the reason it was refused.
  const [undo, setUndo] = useState<{ status: 'idle' | 'running' | 'done'; error?: string }>(() => ({ status: memory.read().undone ? 'done' : 'idle' }));
  const [receipt] = useState(() => memory.read().receipt ?? memory.write({ receipt: newReceiptKey() }).receipt!);

  useEffect(() => {
    if (memory.read().results) return;
    const abort = new AbortController();
    setState({ status: 'loading' });
    previewNotebookOps(JSON.parse(opsKey), abort.signal)
      .then(r => { setPreviews(r.previews); setState({ status: 'pending' }); })
      .catch(e => { if (!abort.signal.aborted) setState({ status: 'error', error: e instanceof Error ? e.message : 'Could not check these changes' }); });
    return () => abort.abort();
  }, [opsKey]);

  const blocked = !!previews?.some(p => p.error);
  const destructive = !!previews?.some(p => p.destructive);
  // The page changed after Bruno read it (its block ids are stale): Bruno can read it again and redo it.
  // Found at preview, or only when applying (a teammate edited the page in between).
  const moved = /changed or was removed/.test(state.error ?? '') || !!previews?.some(p => /changed or was removed/.test(p.error ?? ''));
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!auto || autoTried || state.status !== 'pending' || !previews || blocked || destructive) return;
    setAutoTried(true);
    void confirm();
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.status === 'dismissed') return null;
  const confirm = async () => {
    setState({ status: 'confirming' });
    try {
      const out = await applyNotebookOps(ops, receipt);
      memory.write({ receipt, results: out.results });
      setResults(out.results);
      setState({ status: 'done' });
    } catch (e) {
      setState({ status: 'error', error: e instanceof Error ? e.message : 'Could not apply these changes' });
    }
  };

  const undoCard = async () => {
    setUndo({ status: 'running' });
    try {
      await undoNotebookOps(receipt);
      memory.write({ ...memory.read(), undone: true });
      setUndo({ status: 'done' });
    } catch (e) {
      setUndo({ status: 'idle', error: e instanceof Error ? e.message : 'Could not undo this change' });
    }
  };

  if (state.status === 'done' && undo.status === 'done') {
    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
        <p className="flex items-center gap-2"><Undo2 className="size-4" /> Undone. The notebook is back to how it was before this change.</p>
      </div>
    );
  }

  if (state.status === 'done') {
    const pages = [...new Map(results.filter(r => r.op !== 'delete' && r.pageId).map(r => [r.pageId, r])).values()];
    const undoable = !sticky && canUndoNotebookResults(results);
    return (
      <div className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">
        <p className="flex items-center gap-2"><Check className="size-4" /> {sticky ? 'Sticky notes' : 'Notebook'} updated ({results.length} {results.length === 1 ? 'change' : 'changes'}){autoTried ? ' automatically' : ''}.</p>
        {(pages.length > 0 || undoable) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3">
            {pages.map(r => <Link key={r.pageId} className="underline" to={`/notebook/p/${r.pageId}`}>Open “{r.title}”</Link>)}
            {undoable && (
              <button type="button" className="inline-flex items-center gap-1 underline disabled:opacity-60" disabled={undo.status === 'running'} onClick={undoCard}>
                {undo.status === 'running' ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Undo
              </button>
            )}
          </p>
        )}
        {undo.error && <p className="mt-1 text-destructive" role="alert">{undo.error}</p>}
        {sticky && results.some(r => r.op !== 'sticky_delete') && <p className="mt-1"><button type="button" className="underline" onClick={() => setStickyNotesOpen(true)}>Open sticky notes</button></p>}
      </div>
    );
  }

  return (
    <div className={cn('mt-3 overflow-hidden rounded-xl border bg-card', destructive ? 'border-destructive/40' : 'border-border')} aria-label={sticky ? 'Proposed sticky note changes' : 'Proposed notebook changes'}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">{sticky ? <StickyNote className="size-4" /> : <NotebookPen className="size-4" />} Apply {ops.length} {noun} {ops.length === 1 ? 'change' : 'changes'}?</p>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setState({ status: 'dismissed' })}><X /></Button>
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
        {state.status === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {sticky ? 'Checking your sticky notes…' : 'Checking the notebook…'}</p>}
        {previews?.map((p, i) => (
          <div key={i} className="text-sm">
            <p className={cn('flex items-start gap-1.5 font-medium', p.destructive && 'text-destructive')}>{p.destructive && <Trash2 className="mt-0.5 size-3.5 shrink-0" />}{p.summary}</p>
            {p.error && <p className="text-destructive" role="alert">{p.error}</p>}
            {p.before && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted px-2 py-1 text-xs text-muted-foreground line-through decoration-muted-foreground/60">{p.before}</pre>}
            {p.after && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted px-2 py-1 text-xs">{p.after}</pre>}
          </div>
        ))}
        {moved && onAsk && (
          <Button size="sm" variant="outline" disabled={askDisabled} title={askDisabled ? 'Wait for Bruno to finish answering' : undefined} onClick={() => { setState({ status: 'dismissed' }); onAsk('That part of the page changed since you read it. Read the page again and redo that change.'); }}>Ask Bruno to redo it</Button>
        )}
        {destructive && !blocked && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deleteOk} onChange={e => setDeleteOk(e.target.checked)} />
            {sticky ? 'I understand deleted sticky notes can’t be restored.' : 'I understand this removes notebook content (pages go to Trash and can be restored).'}
          </label>
        )}
      </div>
      {state.status === 'error' && state.error && <p className="px-4 pb-2 text-sm text-destructive" role="alert">{state.error}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <p className="text-xs text-muted-foreground">{sticky ? 'Only your own sticky notes change.' : 'Saved as you, with your notebook permissions.'}</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setState({ status: 'dismissed' })}>Not now</Button>
          <Button size="sm" variant={destructive ? 'destructive' : 'default'} onClick={confirm}
            disabled={!previews || blocked || state.status === 'confirming' || state.status === 'loading' || (destructive && !deleteOk)}>
            {state.status === 'confirming' && <Loader2 className="animate-spin" />}
            {state.status === 'error' ? 'Try again' : 'Apply'}
          </Button>
        </div>
      </div>
    </div>
  );
}
