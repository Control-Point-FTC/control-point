// Mentor review (feature parity 3.4): under a page's details, "Submit for
// review" (with an optional note), the request's status ("Waiting for review",
// "Approved by Ms. Lee", "Changes requested: …"), and Withdraw. Reviewers get a
// queue (View → Review queue) to approve entries or ask for changes.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, MessageSquareWarning, Send } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea } from '../components/ui-kit';
import { apiJson } from '../services/api';
import { cn } from '../components/cn';

export type Review = {
  id: number; pageId: number; pageTitle: string | null; status: 'pending' | 'approved' | 'changes';
  requestedBy: number; requestedByName: string | null; requestedAt: string; note: string;
  reviewerName: string | null; reviewedAt: string | null; comment: string;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const send = (url: string, method: string, body?: unknown, teamId?: number | null) =>
  apiJson<any>(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: teamId ? { 'X-CP-Notebook-Team': String(teamId) } : undefined });

export function NotebookReviewBar({ pageId, teamId }: { pageId: number; teamId?: number | null }) {
  const [state, setState] = useState<{ review: Review | null; canReview: boolean; canWithdraw?: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    const id = pageId;
    return send(`/api/notebook/pages/${id}/review`, 'GET', undefined, teamId).then((d) => { if (id === pageId) setState(d && 'review' in d ? d : null); }).catch(() => setState(null));
  }, [pageId, teamId]);
  useEffect(() => {
    setState(null);
    void load();
    const on = () => { void load(); };
    window.addEventListener('notebook-reviews-changed', on);
    return () => window.removeEventListener('notebook-reviews-changed', on);
  }, [load]);
  if (!state) return null;
  const r = state.review;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); setError(''); setAsking(false); setNote(''); await load(); }
    catch (e: any) { setError(e?.message || 'Could not do that — try again.'); }
    finally { setBusy(false); }
  };
  const pending = r?.status === 'pending';
  return (
    <section className="nb-review my-2 text-xs" aria-label="Mentor review">
      <div className="flex flex-wrap items-center gap-2">
        {r && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5',
            r.status === 'approved' ? 'bg-success/15 text-success' : r.status === 'changes' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground')}>
            {r.status === 'approved' ? <CheckCircle2 className="size-3.5" aria-hidden /> : r.status === 'changes' ? <MessageSquareWarning className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
            {r.status === 'approved' ? `Approved by ${r.reviewerName ?? 'a reviewer'}, ${when(r.reviewedAt)}`
              : r.status === 'changes' ? `Changes requested by ${r.reviewerName ?? 'a reviewer'}`
              : `Waiting for review since ${when(r.requestedAt)}`}
          </span>
        )}
        {!pending && !asking && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAsking(true)}><Send className="size-3.5" /> {r ? 'Submit again' : 'Submit for review'}</Button>}
        {pending && state.canWithdraw && <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => void run(() => send(`/api/notebook/pages/${pageId}/review`, 'DELETE', undefined, teamId))}>Withdraw</Button>}
      </div>
      {r?.status === 'changes' && r.comment && <p className="mt-1 rounded-md bg-warning/10 px-2 py-1 text-foreground">“{r.comment}”</p>}
      {asking && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea aria-label="Note for the reviewer" rows={2} maxLength={1000} placeholder="Anything the reviewer should look at? (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="text-xs" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void run(() => send(`/api/notebook/pages/${pageId}/review`, 'POST', { note }, teamId))}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Submit</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-destructive" role="alert">{error}</p>}
    </section>
  );
}

export function NotebookReviewQueue({ open, onClose, onOpenPage, teamId }: { open: boolean; onClose: () => void; onOpenPage: (id: number) => void; teamId?: number | null }) {
  const [data, setData] = useState<{ canReview: boolean; pending: number; items: Review[] } | null>(null);
  const [comment, setComment] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const load = useCallback(() => send('/api/notebook/reviews', 'GET', undefined, teamId).then(setData).catch((e) => setError(e?.message || 'Could not load reviews')), [teamId]);
  // Teammates' requests and decisions show up while the queue is open.
  useEffect(() => {
    if (!open) return;
    void load();
    const on = () => { void load(); };
    window.addEventListener('notebook-reviews-changed', on);
    return () => window.removeEventListener('notebook-reviews-changed', on);
  }, [open, load]);
  const decide = async (r: Review, status: 'approved' | 'changes') => {
    try { await send(`/api/notebook/reviews/${r.id}`, 'PUT', { status, comment: comment[r.id] ?? '' }, teamId); setError(''); void load(); }
    catch (e: any) { setError(e?.message || 'Could not save the review'); }
  };
  const pending = data?.items.filter((i) => i.status === 'pending') ?? [];
  const decided = data?.items.filter((i) => i.status !== 'pending') ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review queue</DialogTitle>
          <DialogDescription>{data?.canReview ? 'Entries teammates asked a mentor to check.' : 'Your entries waiting for review, and recent decisions.'}</DialogDescription>
        </DialogHeader>
        {!data && !error && <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {data && (
          <div className="space-y-5">
            <section aria-label="Waiting for review">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waiting ({pending.length})</h3>
              {pending.length ? (
                <ul className="space-y-2">
                  {pending.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-baseline gap-2">
                        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => { onOpenPage(r.pageId); onClose(); }}>{r.pageTitle || 'Untitled page'}</button>
                        <span className="shrink-0 text-xs text-muted-foreground">{r.requestedByName} · {when(r.requestedAt)}</span>
                      </div>
                      {r.note && <p className="mt-1 text-sm text-muted-foreground">“{r.note}”</p>}
                      {data.canReview && (
                        <div className="mt-2 space-y-2">
                          <Textarea aria-label={`Comment on ${r.pageTitle || 'this entry'}`} rows={2} maxLength={1000} placeholder="Comment (needed when asking for changes)" value={comment[r.id] ?? ''} onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))} className="text-sm" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => void decide(r, 'approved')}><CheckCircle2 /> Approve</Button>
                            <Button size="sm" variant="outline" disabled={!(comment[r.id] ?? '').trim()} onClick={() => void decide(r, 'changes')}><MessageSquareWarning /> Ask for changes</Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Nothing is waiting.</p>}
            </section>
            {decided.length > 0 && (
              <section aria-label="Recent decisions">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 30 days</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {decided.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50" onClick={() => { onOpenPage(r.pageId); onClose(); }}>
                        {r.status === 'approved' ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <MessageSquareWarning className="size-4 text-warning" aria-hidden />}
                        <span className="min-w-0 flex-1 truncate">{r.pageTitle || 'Untitled page'}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{r.status === 'approved' ? 'Approved' : 'Changes'} by {r.reviewerName} · {when(r.reviewedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
