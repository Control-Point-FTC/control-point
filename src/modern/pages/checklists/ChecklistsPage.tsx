// Checklists (feature parity 4.1). Templates (sections of items, starters
// like Pre-match and Pit setup) and runs: anyone starts a run, checks items
// off (who and when are recorded), marks them partly done or N/A, assigns
// them, then finishes it. Finished runs stay in the run log and can be
// reopened. Reset asks first. Live across the team.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleSlash, ClipboardList, Loader2, Pencil, Play, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { Page, PageHeader, EmptyState, Section } from '../../ui/page';
import {
  Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Progress,
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { apiJson } from '../../../services/api';
import { notify, confirmDialog } from '../../../components/dialog';
import { cn } from '../../../components/cn';
import { ITEM_STATE_LABELS, type ChecklistSection, type ItemState } from '../../../types/checklists';

type Template = { id: number; title: string; description: string; starter: string | null; sections: ChecklistSection[]; itemCount: number };
type Progress = { done: number; total: number; partial: number; na: number };
type RunSummary = { id: number; title: string; templateId: number | null; eventId: number | null; eventTitle: string | null; status: 'open' | 'finished'; startedAt: string; startedByName: string | null; finishedAt: string | null; finishedByName: string | null; progress: Progress };
type ItemInfo = { state: ItemState; note: string; assigneeId: number | null; assigneeName: string | null; setByName: string | null; setAt: string | null };
type Run = RunSummary & { sections: ChecklistSection[]; items: Record<string, ItemInfo> };
type Overview = { templates: Template[]; runs: RunSummary[]; starters: { key: string; title: string; description: string; itemCount: number }[]; canManage: boolean };

const send = (url: string, method: string, body?: unknown) => apiJson<any>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const pct = (p: Progress) => (p.total ? Math.round((p.done / p.total) * 100) : 100);

/** "## Section" lines start a section; every other non-empty line is an item. */
export function templateFromText(text: string): { title: string; items: string[] }[] {
  const sections: { title: string; items: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const head = /^#{1,3}\s*(.*)$/.exec(line);
    if (head) { sections.push({ title: head[1].trim(), items: [] }); continue; }
    if (!sections.length) sections.push({ title: '', items: [] });
    sections[sections.length - 1].items.push(line.replace(/^[-*]\s*(\[[ x]\]\s*)?/i, ''));
  }
  return sections;
}
export const templateToText = (sections: ChecklistSection[]) => sections.map((s) => [s.title ? `## ${s.title}` : '', ...s.items.map((i) => i.text)].filter(Boolean).join('\n')).join('\n\n');

export function ChecklistsPage({ events = [], members = [] }: { events?: any[]; members?: any[] }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [starting, setStarting] = useState<Template | null | 'pick'>(null);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  const load = useCallback(() => apiJson<Overview>('/api/checklists', { cache: 'no-store' }).then((d) => { setData(d); setError(''); }).catch((e) => setError(e?.message || 'Could not load checklists')), []);
  useEffect(() => {
    void load();
    const on = () => { void load(); };
    window.addEventListener('checklists-changed', on);
    return () => window.removeEventListener('checklists-changed', on);
  }, [load]);

  const addStarter = async (key: string) => {
    try { await send('/api/checklists/templates', 'POST', { starter: key }); notify('Added. Edit it to fit your team.', 'success'); void load(); }
    catch (e: any) { notify(e?.message || 'Could not add that checklist', 'error'); }
  };
  const archive = async (t: Template) => {
    if (!(await confirmDialog({ title: `Remove "${t.title}"?`, message: 'Runs already made from it stay in the run log.', confirmLabel: 'Remove', danger: true }))) return;
    try { await send(`/api/checklists/templates/${t.id}`, 'DELETE'); void load(); } catch (e: any) { notify(e?.message || 'Could not remove it', 'error'); }
  };

  const open = data?.runs.filter((r) => r.status === 'open') ?? [];
  const finished = data?.runs.filter((r) => r.status === 'finished') ?? [];
  const missingStarters = data ? data.starters.filter((s) => !data.templates.some((t) => t.starter === s.key)) : [];

  return (
    <Page>
      <PageHeader
        eyebrow="Engineering"
        title="Checklists"
        description="Pre-match, pit and travel checklists: start a run, check items off together, and keep a log."
        actions={(
          <div className="flex flex-wrap gap-2">
            {data?.templates.length ? <Button onClick={() => setStarting('pick')}><Play /> Start a run</Button> : null}
            {data?.canManage && <Button variant="outline" onClick={() => setEditing('new')}><Plus /> New checklist</Button>}
          </div>
        )}
      />
      {!data && !error && <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
      {error && <EmptyState icon={ClipboardList} title="Checklists didn't load" description={error} />}
      {data && (
        <>
          <Section title="Open runs">
            {open.length ? (
              <div className="grid gap-3 sm:grid-cols-2">{open.map((r) => <RunCard key={r.id} run={r} onOpen={() => setOpenRun(r.id)} />)}</div>
            ) : <p className="text-sm text-muted-foreground">No runs going. Start one from a checklist below.</p>}
          </Section>
          <Section title="Checklists">
            {data.templates.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.templates.map((t) => (
                  <Card key={t.id} className="flex flex-col gap-3 p-4">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-sm text-muted-foreground">{t.itemCount} items{t.sections.length > 1 ? ` in ${t.sections.length} sections` : ''}{t.description ? ` · ${t.description}` : ''}</p>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setStarting(t)}><Play /> Start</Button>
                      {data.canManage && <Button size="sm" variant="outline" onClick={() => setEditing(t)}><Pencil /> Edit</Button>}
                      {data.canManage && <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" aria-label={`Remove ${t.title}`} onClick={() => void archive(t)}><Trash2 /></Button>}
                    </div>
                  </Card>
                ))}
              </ul>
            ) : <EmptyState icon={ClipboardList} title="No checklists yet" description={data.canManage ? 'Add a starter below or make your own.' : 'Ask a team lead to add one.'} />}
          </Section>
          {data.canManage && missingStarters.length > 0 && (
            <Section title="Starter checklists">
              <div className="flex flex-wrap gap-2">
                {missingStarters.map((s) => <Button key={s.key} variant="outline" size="sm" title={s.description} onClick={() => void addStarter(s.key)}><Plus /> {s.title} ({s.itemCount})</Button>)}
              </div>
            </Section>
          )}
          {finished.length > 0 && (
            <Section title="Run log (last 30 days)">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {finished.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50" onClick={() => setOpenRun(r.id)}>
                      <Check className="size-4 text-success" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{r.title}{r.eventTitle ? <span className="text-muted-foreground"> · {r.eventTitle}</span> : null}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.progress.done} of {r.progress.total} · {r.finishedByName ? `${r.finishedByName}, ` : ''}{when(r.finishedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {starting && data && <StartRunDialog templates={data.templates} initial={starting === 'pick' ? null : starting} events={events} onClose={() => setStarting(null)} onStarted={(id) => { setStarting(null); void load(); setOpenRun(id); }} />}
      {editing && <TemplateDialog template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <RunSheet runId={openRun} members={members} canManage={!!data?.canManage} onClose={() => setOpenRun(null)} onChanged={() => void load()} />
    </Page>
  );
}

function RunCard({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  const p = run.progress;
  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{run.title}</span>
        <Badge variant="outline">{p.done} of {p.total}</Badge>
      </div>
      <Progress value={pct(p)} aria-label={`${run.title}: ${p.done} of ${p.total} done`} />
      <p className="text-xs text-muted-foreground">{run.eventTitle ? `${run.eventTitle} · ` : ''}Started {when(run.startedAt)}{run.startedByName ? ` by ${run.startedByName}` : ''}{p.na ? ` · ${p.na} N/A` : ''}</p>
    </button>
  );
}

function StartRunDialog({ templates, initial, events, onClose, onStarted }: { templates: Template[]; initial: Template | null; events: any[]; onClose: () => void; onStarted: (id: number) => void }) {
  const [templateId, setTemplateId] = useState<number>(initial?.id ?? templates[0]?.id);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() => events.filter((e) => typeof e?.id === 'number' && String(e.date) >= today).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 30), [events, today]);
  const start = async () => {
    setBusy(true);
    try {
      const r = await send('/api/checklists/runs', 'POST', { templateId, title: title.trim() || undefined, eventId: eventId || undefined });
      onStarted(r.id);
    } catch (e: any) { notify(e?.message || 'Could not start the run', 'error'); }
    finally { setBusy(false); }
  };
  const select = 'h-9 w-full rounded-md border border-border bg-transparent px-2 text-sm';
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Start a run</DialogTitle><DialogDescription>Everyone on the team can check items off as you go.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="run-template">Checklist</Label>
            <select id="run-template" className={select} value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))}>{templates.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.itemCount})</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="run-title">Name (optional)</Label>
            <Input id="run-title" maxLength={80} placeholder={`${templates.find((t) => t.id === templateId)?.title ?? ''}, e.g. "Pre-match Q12"`} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="run-event">For an event (optional)</Label>
            <select id="run-event" className={select} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">No event</option>
              {upcoming.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.title}</option>)}
            </select></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || !templateId} onClick={() => void start()}>{busy ? <Loader2 className="animate-spin" /> : <Play />} Start</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [text, setText] = useState(template ? templateToText(template.sections) : '## Before\nFirst thing to check\n\n## After\nLast thing to check');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    // Unchanged item text keeps its id, so the template's history lines up.
    const old = new Map((template?.sections ?? []).flatMap((s) => s.items).map((i) => [i.text, i.id]));
    const sections = templateFromText(text).map((s) => ({ title: s.title, items: s.items.map((t) => ({ id: old.get(t), text: t })) }));
    setBusy(true);
    try {
      await send(template ? `/api/checklists/templates/${template.id}` : '/api/checklists/templates', template ? 'PUT' : 'POST', { title, description, sections });
      onSaved();
    } catch (e: any) { notify(e?.message || 'Could not save the checklist', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{template ? 'Edit checklist' : 'New checklist'}</DialogTitle><DialogDescription>One item per line. Start a line with ## to begin a section (Morning, Between matches, Power…). Runs already started keep their own copy.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="ck-title">Name</Label><Input id="ck-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ck-desc">Description (optional)</Label><Input id="ck-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ck-items">Items</Label><Textarea id="ck-items" rows={12} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || !title.trim()} onClick={() => void save()}>{busy && <Loader2 className="animate-spin" />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATE_STYLE: Record<ItemState, string> = { done: 'bg-success/15 text-success', partial: 'bg-warning/15 text-warning', na: 'bg-muted text-muted-foreground', open: '' };

function RunSheet({ runId, members, canManage, onClose, onChanged }: { runId: number | null; members: any[]; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const side = useIsNarrow() ? 'bottom' : 'right';
  const load = useCallback(() => { if (runId) void apiJson<Run>(`/api/checklists/runs/${runId}`, { cache: 'no-store' }).then(setRun).catch(() => setRun(null)); }, [runId]);
  useEffect(() => {
    setRun(null);
    load();
    const on = (e: Event) => { const id = (e as CustomEvent).detail?.runId; if (!id || id === runId) load(); };
    window.addEventListener('checklists-changed', on);
    return () => window.removeEventListener('checklists-changed', on);
  }, [load, runId]);

  const act = async (fn: () => Promise<Run>) => {
    try { setRun(await fn()); onChanged(); } catch (e: any) { notify(e?.message || 'Could not save that', 'error'); }
  };
  const setItem = (itemId: string, body: Record<string, unknown>) => act(() => send(`/api/checklists/runs/${runId}/items/${encodeURIComponent(itemId)}`, 'PUT', body));
  const reset = async () => {
    if (!(await confirmDialog({ title: 'Reset this run?', message: 'Every item goes back to not done, and who checked what is cleared. This can\'t be undone.', confirmLabel: 'Reset', danger: true }))) return;
    await act(() => send(`/api/checklists/runs/${runId}/reset`, 'POST'));
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this run?', message: 'It leaves the run log for good.', confirmLabel: 'Delete', danger: true }))) return;
    try { await send(`/api/checklists/runs/${runId}`, 'DELETE'); onChanged(); onClose(); } catch (e: any) { notify(e?.message || 'Could not delete it', 'error'); }
  };
  const editable = run?.status === 'open';

  return (
    <Sheet open={runId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={side} className={cn('gap-0 p-0', side === 'right' ? 'sm:max-w-lg' : 'max-h-[90dvh]')}>
        {run && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <SheetTitle>{run.title}</SheetTitle>
              <SheetDescription>{run.progress.done} of {run.progress.total} done{run.progress.na ? ` · ${run.progress.na} N/A` : ''}{run.eventTitle ? ` · ${run.eventTitle}` : ''}{run.status === 'finished' ? ` · finished ${when(run.finishedAt)}${run.finishedByName ? ` by ${run.finishedByName}` : ''}` : ''}</SheetDescription>
              <Progress value={pct(run.progress)} className="mt-2" aria-hidden />
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {run.sections.map((s) => (
                <section key={s.id} aria-label={s.title || 'Items'}>
                  {s.title && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</h3>}
                  <ul className="space-y-1.5">
                    {s.items.map((it) => {
                      const info = run.items[it.id];
                      const state: ItemState = info?.state ?? 'open';
                      return (
                        <li key={it.id} className={cn('rounded-lg border border-border px-3 py-2', STATE_STYLE[state])}>
                          <div className="flex items-start gap-2">
                            <button type="button" disabled={!editable} aria-pressed={state === 'done'} aria-label={`${state === 'done' ? 'Uncheck' : 'Check off'} ${it.text}`}
                              className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border', state === 'done' ? 'border-success bg-success text-white' : 'border-foreground/40')}
                              onClick={() => void setItem(it.id, { state: state === 'done' ? 'open' : 'done' })}>
                              {state === 'done' && <Check className="size-3.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-sm', state === 'na' && 'line-through')}>{it.text}</p>
                              {(info?.setByName || info?.assigneeName) && (
                                <p className="text-xs text-muted-foreground">{info.setByName && state !== 'open' ? `${ITEM_STATE_LABELS[state]} by ${info.setByName}, ${when(info.setAt)}` : ''}{info.assigneeName ? `${info.setByName && state !== 'open' ? ' · ' : ''}for ${info.assigneeName}` : ''}</p>
                              )}
                            </div>
                            {editable && (
                              <div className="flex shrink-0 items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-pressed={state === 'partial'} onClick={() => void setItem(it.id, { state: state === 'partial' ? 'open' : 'partial' })}>Partly</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-pressed={state === 'na'} aria-label={`Mark ${it.text} N/A`} onClick={() => void setItem(it.id, { state: state === 'na' ? 'open' : 'na' })}><CircleSlash className="size-3.5" /> N/A</Button>
                                <select aria-label={`Assign ${it.text}`} className="h-7 max-w-24 rounded border border-border bg-transparent px-1 text-xs" value={info?.assigneeId ?? ''} onChange={(e) => void setItem(it.id, { assigneeId: e.target.value ? Number(e.target.value) : null })}>
                                  <option value="">Anyone</option>
                                  {members.filter((m) => m?.is_active !== 0).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
              {editable ? (
                <>
                  <Button onClick={() => void act(() => send(`/api/checklists/runs/${runId}/finish`, 'POST'))}><Check /> Finish run</Button>
                  <Button variant="outline" onClick={() => void reset()}><RotateCcw /> Reset</Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => void act(() => send(`/api/checklists/runs/${runId}/reopen`, 'POST'))}><Undo2 /> Reopen</Button>
              )}
              {canManage && <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => void remove()}><Trash2 /> Delete</Button>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
