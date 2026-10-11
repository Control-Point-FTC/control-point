// Confirm card for Bruno's proposed notebook changes. What it shows comes from
// the server (resolved under Bruno's access, so protected pages appear only as
// "unavailable"), never from the model's own description. Deletions need an
// explicit tick before the button unlocks.
import { useEffect, useState } from 'react';
import { Check, Loader2, NotebookPen, StickyNote, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../cn';
import { Button } from '../ui-kit';
import { applyNotebookOps, isStickyOp, newReceiptKey, previewNotebookOps, type NotebookOpPreview, type NotebookOpResult } from '../../services/notebookProposals';
import { setStickyNotesOpen } from '../../notebook/stickyNotesState';

type State = { status: 'loading' | 'pending' | 'confirming' | 'done' | 'dismissed' | 'error'; error?: string };
type Memory = { receipt?: string; results?: NotebookOpResult[] };

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
export function NotebookProposalCard({ ops, scope }: { ops: Record<string, unknown>[]; scope: string }) {
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

  if (state.status === 'dismissed') return null;
  const blocked = !!previews?.some(p => p.error);
  const destructive = !!previews?.some(p => p.destructive);
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

  if (state.status === 'done') {
    const pages = [...new Map(results.filter(r => r.op !== 'delete' && r.pageId).map(r => [r.pageId, r])).values()];
    return (
      <div className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">
        <p className="flex items-center gap-2"><Check className="size-4" /> {sticky ? 'Sticky notes' : 'Notebook'} updated ({results.length} {results.length === 1 ? 'change' : 'changes'}).</p>
        {pages.length > 0 && <p className="mt-1 flex flex-wrap gap-x-3">{pages.map(r => <Link key={r.pageId} className="underline" to={`/notebook/p/${r.pageId}`}>Open “{r.title}”</Link>)}</p>}
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
