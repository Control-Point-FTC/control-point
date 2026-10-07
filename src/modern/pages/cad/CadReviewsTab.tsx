// Modern CAD → Design reviews: status filter with counts, review cards with
// screenshots, a detail sheet with the workflow stepper, permitted status
// moves (useCadReviews.actionsFor), admin delete and the comment thread, and
// a drafted "Submit design" sheet.
import { useMemo, useState } from 'react';
import { Check, ClipboardCheck, ExternalLink, Eye, Hammer, ImagePlus, MessageSquare, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription,
  SheetFooter, SheetHeader, SheetTitle, Skeleton, Textarea, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { CAD_SECTIONS, REVIEW_FILTERS, REVIEW_STATUS_LABELS, fmtDate, useCadReviews, useReviewComments, useReviewForm } from '../../../components/cad/useCad';
import { EmptyState } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';

type Reviews = ReturnType<typeof useCadReviews>;

export const STATUS_TONE: Record<string, string> = {
  concept: 'border-border bg-muted text-muted-foreground',
  in_review: 'border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-300',
  approved: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  changes_requested: 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300',
  built: 'border-accent/30 bg-accent/15 text-accent',
};
const MOVE_ICON: Record<string, typeof Check> = { in_review: Eye, approved: Check, changes_requested: RotateCcw, built: Hammer };
const FLOW = ['concept', 'in_review', 'approved', 'built'];

export function CadReviewsTab({ currentUser, isAdmin }: { currentUser?: any; isAdmin: boolean }) {
  const ctl = useCadReviews({ currentUser, isAdmin });
  const [openId, setOpenId] = useState<number | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ctl.reviews.length };
    for (const r of ctl.reviews) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [ctl.reviews]);
  const open = ctl.reviews.find((r) => r.id === openId) ?? null;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ToggleGroup variant="chips" type="single" aria-label="Status" value={ctl.filter} onValueChange={(v) => { if (v) ctl.setFilter(v); }} className="max-w-full overflow-x-auto flex-nowrap">
          {REVIEW_FILTERS.map((s) => (
            <ToggleGroupItem key={s} value={s}>
              {s === 'all' ? 'All' : REVIEW_STATUS_LABELS[s]}{counts[s] ? <span className="text-muted-foreground"> {counts[s]}</span> : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button onClick={() => ctl.setShowForm(true)} className="ml-auto"><Plus /> Submit design</Button>
      </div>

      {!ctl.loaded ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-56" />)}</div> : ctl.visible.length ? (
        <Stagger as="ul" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ctl.visible.map((r) => (
            <StaggerItem as="li" key={r.id}>
              <button onClick={() => setOpenId(r.id)} className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                {r.screenshot_url
                  ? <img src={r.screenshot_url} alt="" className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100" />
                  : <span className="flex aspect-video w-full items-center justify-center bg-muted/50"><ClipboardCheck className="size-8 text-muted-foreground/60" /></span>}
                <span className="flex flex-1 flex-col gap-2 p-4">
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    <Badge variant="outline" className={STATUS_TONE[r.status]}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">{r.section}{r.author_name ? ` · ${r.author_name}` : ''} · {fmtDate(r.created_at)}</span>
                  {r.description && <span className="line-clamp-2 text-sm text-muted-foreground">{r.description}</span>}
                  <span className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground"><MessageSquare className="size-3.5" />{r.comment_count || 0} comment{(r.comment_count || 0) === 1 ? '' : 's'}</span>
                </span>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      ) : <EmptyState icon={ClipboardCheck} title="No designs here yet" description="Submit the first design for review — nothing gets built off an unreviewed design." action={<Button onClick={() => ctl.setShowForm(true)}><Plus /> Submit design</Button>} />}

      <ReviewSheet review={open} ctl={ctl} isAdmin={isAdmin} onClose={() => setOpenId(null)} />
      <SubmitSheet ctl={ctl} />
    </>
  );
}

function Flow({ status }: { status: string }) {
  const at = status === 'changes_requested' ? 1 : FLOW.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Review progress">
      {FLOW.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className="min-w-0">
          <span className={cn('block h-1.5 rounded-full transition-colors duration-500', i <= at ? (status === 'changes_requested' && i === at ? 'bg-amber-500' : 'bg-accent') : 'bg-muted')} />
          <span className={cn('mt-1 block truncate text-[11px]', i === at ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {i === at && status === 'changes_requested' ? 'Changes requested' : REVIEW_STATUS_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ReviewSheet({ review, ctl, isAdmin, onClose }: { review: any | null; ctl: Reviews; isAdmin: boolean; onClose: () => void }) {
  const narrow = useIsNarrow();
  return (
    <Sheet open={!!review} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-xl')}>
        {review && <ReviewDetail review={review} ctl={ctl} isAdmin={isAdmin} onDeleted={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function ReviewDetail({ review, ctl, isAdmin, onDeleted }: { review: any; ctl: Reviews; isAdmin: boolean; onDeleted: () => void }) {
  const c = useReviewComments(review.id, ctl.load);
  const moves = ctl.actionsFor(review);
  return (
    <>
      <SheetHeader className="border-b border-border px-6 py-5 pr-12">
        <SheetTitle>{review.title}</SheetTitle>
        <SheetDescription>{review.section}{review.author_name ? ` · ${review.author_name}` : ''} · {fmtDate(review.created_at)}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <Flow status={review.status} />
        {review.screenshot_url && <img src={review.screenshot_url} alt="" className="w-full rounded-xl border border-border object-cover" />}
        {review.description && <p className="whitespace-pre-wrap text-sm">{review.description}</p>}
        {review.onshape_url && <Button asChild variant="outline" size="sm" className="max-sm:h-11"><a href={review.onshape_url} target="_blank" rel="noreferrer"><ExternalLink /> Open in Onshape</a></Button>}
        {(moves.length > 0 || isAdmin) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {moves.map((m) => {
              const Icon = MOVE_ICON[m.to] ?? Check;
              return <Button key={m.to} size="sm" variant={m.primary ? 'default' : 'outline'} onClick={() => void ctl.setStatus(review.id, m.to)} className="max-sm:h-11"><Icon /> {m.label}</Button>;
            })}
            {isAdmin && <Button size="sm" variant="ghost" onClick={async () => { if (await ctl.remove(review.id)) onDeleted(); }} className="ml-auto text-destructive hover:text-destructive max-sm:h-11"><Trash2 /> Delete</Button>}
          </div>
        )}
        <section aria-label="Discussion" className="border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold">Discussion</h3>
          {c.comments.length ? (
            <ul className="space-y-3">
              {c.comments.map((cm) => (
                <li key={cm.id} className="rounded-xl bg-muted/50 px-3 py-2.5">
                  <p className="text-xs"><span className="font-medium">{cm.author_name || 'Member'}</span> <span className="text-muted-foreground">· {fmtDate(cm.created_at)}</span></p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{cm.comment}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No comments yet — start the discussion.</p>}
        </section>
      </div>
      <form className="flex gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); void c.send(); }}>
        <Input value={c.text} onChange={(e) => c.setText(e.target.value)} disabled={c.sending} placeholder="Add a comment…" aria-label="Add a comment" className="max-sm:h-11" />
        <Button type="submit" size="icon" disabled={!c.text.trim() || c.sending} aria-label="Send comment" className="shrink-0"><Send /></Button>
      </form>
    </>
  );
}

function SubmitSheet({ ctl }: { ctl: Reviews }) {
  const narrow = useIsNarrow();
  const f = useReviewForm(() => { ctl.setShowForm(false); void ctl.load(); });
  return (
    <Sheet open={ctl.showForm} onOpenChange={(o) => { if (!o && !f.busy) ctl.setShowForm(false); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>Submit a design for review</SheetTitle>
          <SheetDescription>Nothing gets built off an unreviewed design.</SheetDescription>
        </SheetHeader>
        <form id="review-form" className="flex-1 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); void f.submit(); }}>
          <fieldset disabled={f.busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <div className="grid gap-2">
              <Label htmlFor="rv-title">Title</Label>
              <Input id="rv-title" value={f.form.title} onChange={(e) => f.set({ title: e.target.value })} placeholder="Intake v3 — dual roller" className="max-sm:h-11" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rv-section">Subsystem</Label>
                <Select value={f.form.section} onValueChange={(v) => f.set({ section: v })}>
                  <SelectTrigger id="rv-section" className="max-sm:h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAD_SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rv-onshape">Onshape link</Label>
                <Input id="rv-onshape" value={f.form.onshapeUrl} onChange={(e) => f.set({ onshapeUrl: e.target.value })} placeholder="https://cad.onshape.com/…" className="max-sm:h-11" />
              </div>
            </div>
            <FilePick id="rv-shot" label="Screenshot (optional)" accept="image/*" file={f.form.shot} onPick={(file) => f.set({ shot: file })} />
            <div className="grid gap-2">
              <Label htmlFor="rv-desc">Description</Label>
              <Textarea id="rv-desc" rows={4} value={f.form.description} onChange={(e) => f.set({ description: e.target.value })} placeholder="What changed, what needs eyes on it…" />
            </div>
          </fieldset>
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={() => ctl.setShowForm(false)} disabled={f.busy}>Cancel</Button>
          <Button type="submit" form="review-form" disabled={f.busy}><Check /> {f.busy ? 'Submitting…' : 'Submit'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** A file picker drawn as a drop-style button that shows the chosen file. */
export function FilePick({ id, label, accept, file, onPick, multiple }: { id: string; label: string; accept: string; file: File | null; onPick: (f: File | null) => void; multiple?: boolean }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60">
        <ImagePlus className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Choose a file…'}</span>
        <input id={id} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(e) => onPick(e.target.files?.[0] || null)} />
      </label>
    </div>
  );
}
