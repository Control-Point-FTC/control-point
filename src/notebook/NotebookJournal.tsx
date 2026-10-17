// The notebook as a journal (feature parity 3.2): every entry the member can
// see as a card (title, when the work happened, excerpt, type / stage /
// subsystem / award chips, authors, read time), grouped by week ("This week",
// "Last week", "Week of Oct 5") or by judged award, with filters by type,
// stage, subsystem and author. Picking a card opens the page.
import { useEffect, useMemo, useState } from 'react';
import { Award, Cog, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui-kit';
import { apiJson } from '../services/api';
import { FTC_AWARDS, awardById } from '../types/taskTags';
import { ENTRY_STAGES, ENTRY_TYPES, entryStageLabel, entryTypeLabel } from './entryMeta';

export type JournalEntry = {
  id: number; title: string; sectionId: number; sectionTitle: string; date: string; workDate: string | null; createdAt: string; updatedAt: string;
  excerpt: string; readMinutes: number; type: string | null; stage: string | null; subsystems: string[]; awards: string[]; authors: string[];
};

const dayMs = 86_400_000;
const noonUtc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
/** Sunday-started week of a date ("YYYY-MM-DD" of that Sunday). */
const weekStart = (iso: string) => { const t = noonUtc(iso); return new Date(t - new Date(t).getUTCDay() * dayMs).toISOString().slice(0, 10); };

/** "This week", "Last week", or "Week of Oct 5" relative to `today`. */
export function weekLabel(iso: string, today: string): string {
  const w = weekStart(iso), now = weekStart(today);
  if (w === now) return 'This week';
  if (noonUtc(now) - noonUtc(w) === 7 * dayMs) return 'Last week';
  if (w > now) return 'Upcoming';
  return `Week of ${new Date(noonUtc(w)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: w.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', timeZone: 'UTC' })}`;
}

export type JournalFilter = { type: string; stage: string; subsystem: string; author: string };
export const filterEntries = (entries: JournalEntry[], f: JournalFilter) => entries.filter((e) =>
  (!f.type || e.type === f.type) && (!f.stage || e.stage === f.stage) && (!f.subsystem || e.subsystems.includes(f.subsystem)) && (!f.author || e.authors.includes(f.author)));

/** Groups in display order: by week (newest first), or by award (taxonomy order, then "No award"). */
export function groupEntries(entries: JournalEntry[], by: 'week' | 'award', today: string): { label: string; hint?: string; entries: JournalEntry[] }[] {
  if (by === 'award') {
    const groups = FTC_AWARDS.map((a) => ({ label: a.name, hint: a.criteria, entries: entries.filter((e) => e.awards.includes(a.id)) })).filter((g) => g.entries.length);
    const none = entries.filter((e) => !e.awards.length);
    return none.length ? [...groups, { label: 'No award tagged', entries: none }] : groups;
  }
  const out: { label: string; entries: JournalEntry[] }[] = [];
  for (const e of entries) {
    const label = weekLabel(e.date, today);
    const last = out[out.length - 1];
    if (last?.label === label) last.entries.push(e); else out.push({ label, entries: [e] });
  }
  return out;
}

export function NotebookJournal({ open, onClose, onOpenPage, teamId }: { open: boolean; onClose: () => void; onOpenPage: (id: number) => void; teamId?: number | null }) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState('');
  const [by, setBy] = useState<'week' | 'award'>('week');
  const [filter, setFilter] = useState<JournalFilter>({ type: '', stage: '', subsystem: '', author: '' });
  useEffect(() => {
    if (!open) return;
    let live = true;
    setEntries(null);
    apiJson<{ entries: JournalEntry[] }>('/api/notebook/journal', { cache: 'no-store', headers: teamId ? { 'X-CP-Notebook-Team': String(teamId) } : undefined })
      .then((d) => { if (live) { setEntries(Array.isArray(d?.entries) ? d.entries : []); setError(''); } })
      .catch((e) => { if (live) { setEntries([]); setError(e?.message || 'Could not load the journal'); } });
    return () => { live = false; };
  }, [open, teamId]);

  const today = new Date().toLocaleDateString('en-CA');
  const subsystems = useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.subsystems))].sort(), [entries]);
  const authors = useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.authors))].sort(), [entries]);
  const shown = useMemo(() => filterEntries(entries ?? [], filter), [entries, filter]);
  const groups = useMemo(() => groupEntries(shown, by, today), [shown, by, today]);
  const select = 'h-8 rounded-md border border-border bg-transparent px-2 text-xs';
  const set = (k: keyof JournalFilter) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilter((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Journal</DialogTitle>
          <DialogDescription>Every entry, newest first by when the work happened.</DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2" role="group" aria-label="Journal filters">
            <select className={select} aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as 'week' | 'award')}>
              <option value="week">By week</option>
              <option value="award">By award</option>
            </select>
            <select className={select} aria-label="Filter by type" value={filter.type} onChange={set('type')}><option value="">Any type</option>{ENTRY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            <select className={select} aria-label="Filter by stage" value={filter.stage} onChange={set('stage')}><option value="">Any stage</option>{ENTRY_STAGES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            {subsystems.length > 0 && <select className={select} aria-label="Filter by subsystem" value={filter.subsystem} onChange={set('subsystem')}><option value="">Any subsystem</option>{subsystems.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
            {authors.length > 0 && <select className={select} aria-label="Filter by author" value={filter.author} onChange={set('author')}><option value="">Anyone</option>{authors.map((a) => <option key={a} value={a}>{a}</option>)}</select>}
            {entries && <span className="ml-auto text-xs text-muted-foreground">{shown.length} of {entries.length} entries</span>}
          </div>
        </DialogHeader>
        <div className="max-h-[calc(90dvh-9rem)] space-y-6 overflow-y-auto px-6 py-5">
          {!entries && <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {entries && !groups.length && !error && <p className="text-sm text-muted-foreground">{entries.length ? 'No entries match these filters.' : 'No entries yet. Pages you write show up here.'}</p>}
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" title={g.hint}>{g.label} <span className="font-normal">({g.entries.length})</span></h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.entries.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="flex h-full w-full flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50" onClick={() => { onOpenPage(e.id); onClose(); }}>
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{e.title || 'Untitled page'}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{new Date(noonUtc(e.date)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                      </span>
                      {e.excerpt && <span className="line-clamp-2 text-xs text-muted-foreground">{e.excerpt}</span>}
                      <span className="flex flex-wrap gap-1">
                        {e.type && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{entryTypeLabel(e.type)}</span>}
                        {e.stage && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{entryStageLabel(e.stage)}</span>}
                        {e.subsystems.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]"><Cog className="size-3" aria-hidden />{s}</span>)}
                        {e.awards.map((a) => <span key={a} title={awardById(a)?.criteria} className="inline-flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-[11px]"><Award className="size-3 text-accent" aria-hidden />{awardById(a)?.name ?? a}</span>)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{e.sectionTitle}{e.authors.length ? ` · ${e.authors.join(', ')}` : ''}{e.readMinutes ? ` · ${e.readMinutes} min read` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
