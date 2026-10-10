// Confirm card for Bruno's proposed notebook changes. What it shows comes from
// the server (resolved under Bruno's access, so protected pages appear only as
// "unavailable"), never from the model's own description. Deletions need an
// explicit tick before the button unlocks.
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, NotebookPen, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../cn';
import { Button } from '../ui-kit';
import { applyNotebookOps, newReceiptKey, previewNotebookOps, type NotebookOpPreview, type NotebookOpResult } from '../../services/notebookProposals';

type State = { status: 'loading' | 'pending' | 'confirming' | 'done' | 'dismissed' | 'error'; error?: string };

export function NotebookProposalCard({ ops }: { ops: Record<string, unknown>[] }) {
  const [previews, setPreviews] = useState<NotebookOpPreview[] | null>(null);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [results, setResults] = useState<NotebookOpResult[]>([]);
  const [deleteOk, setDeleteOk] = useState(false);
  const receipt = useRef(newReceiptKey());
  const opsKey = JSON.stringify(ops);

  useEffect(() => {
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
      const out = await applyNotebookOps(ops, receipt.current);
      setResults(out.results);
      setState({ status: 'done' });
    } catch (e) {
      setState({ status: 'error', error: e instanceof Error ? e.message : 'Could not apply these changes' });
    }
  };

  if (state.status === 'done') {
    const pages = [...new Map(results.filter(r => r.op !== 'delete').map(r => [r.pageId, r])).values()];
    return (
      <div className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">
        <p className="flex items-center gap-2"><Check className="size-4" /> Notebook updated ({results.length} {results.length === 1 ? 'change' : 'changes'}).</p>
        {pages.length > 0 && <p className="mt-1 flex flex-wrap gap-x-3">{pages.map(r => <Link key={r.pageId} className="underline" to={`/notebook/p/${r.pageId}`}>Open “{r.title}”</Link>)}</p>}
      </div>
    );
  }

  return (
    <div className={cn('mt-3 overflow-hidden rounded-xl border bg-card', destructive ? 'border-destructive/40' : 'border-border')} aria-label="Proposed notebook changes">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium"><NotebookPen className="size-4" /> Apply {ops.length} notebook {ops.length === 1 ? 'change' : 'changes'}?</p>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setState({ status: 'dismissed' })}><X /></Button>
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
        {state.status === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking the notebook…</p>}
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
            I understand this removes notebook content (pages go to Trash and can be restored).
          </label>
        )}
      </div>
      {state.status === 'error' && state.error && <p className="px-4 pb-2 text-sm text-destructive" role="alert">{state.error}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <p className="text-xs text-muted-foreground">Saved as you, with your notebook permissions.</p>
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
