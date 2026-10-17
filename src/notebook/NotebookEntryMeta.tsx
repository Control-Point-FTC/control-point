// Entry metadata under a notebook page's title (feature parity 3.1): when the
// work happened, entry type, design stage, subsystem and award chips (each
// award explains what judges look for on hover), the read time, and a byline:
// "Written by … · last edited by …". Saved beside the page, not in its text.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, CalendarDays, Clock, Cog, Plus, X } from 'lucide-react';
import { apiJson } from '../services/api';
import { FTC_AWARDS, awardById } from '../types/taskTags';
import { ENTRY_STAGES, ENTRY_TYPES, type EntryMeta } from './entryMeta';

type MetaResponse = {
  meta: EntryMeta;
  readMinutes: number;
  writtenBy: string[];
  lastEditedBy: string | null;
  createdAt: string;
  teamSubsystems: string[];
  canEdit: boolean;
  version?: string | null;
};

/** How often an open page checks for teammates' changes to its details. */
const REFRESH_MS = 20_000;

export function NotebookEntryMeta({ pageId, teamId, revision, disabled }: { pageId: number; teamId?: number | null; revision?: number; disabled?: boolean }) {
  const [data, setData] = useState<MetaResponse | null>(null);
  const [error, setError] = useState('');
  const headers = teamId ? { 'X-CP-Notebook-Team': String(teamId) } : undefined;
  // Saves run one at a time, in order; a reload never lands while one is pending.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);

  const load = useCallback(() => {
    if (pending.current) return Promise.resolve();
    return apiJson<MetaResponse>(`/api/notebook/pages/${pageId}/meta`, { headers, cache: 'no-store' })
      // Only a well-formed answer is shown (the row never takes the page down with it).
      .then((d) => { if (!pending.current) setData(d && d.meta && Array.isArray(d.meta.subsystems) && Array.isArray(d.meta.awards) ? d : null); })
      .catch(() => {});
  }, [pageId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when the page changes or is saved (the byline and read time follow
  // edits), when the window comes back into focus, and every 20 s for
  // teammates' changes to the details.
  useEffect(() => { setData(null); setError(''); }, [pageId]);
  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') void load(); };
    const timer = window.setInterval(onFocus, REFRESH_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  if (!data) return null;
  const { meta } = data;
  const editable = data.canEdit && !disabled;

  /** Shows the change at once, then saves it after any earlier save. Chip
   *  changes go as add/remove so a teammate's tags are never overwritten. */
  const save = (shown: Partial<EntryMeta>, body: Record<string, unknown> = shown) => {
    setData((d) => (d ? { ...d, meta: { ...d.meta, ...shown } } : d));
    pending.current++;
    queue.current = queue.current.then(async () => {
      try {
        const r = await apiJson<{ meta: EntryMeta; version?: string }>(`/api/notebook/pages/${pageId}/meta`, { method: 'PUT', headers, body: JSON.stringify(body) });
        // The newest saved state wins once the last queued save is done.
        if (pending.current === 1) setData((d) => (d ? { ...d, meta: r.meta, version: r.version ?? d.version } : d));
        setError('');
      } catch (e: any) {
        setError(e?.message || 'Could not save that — try again.');
      } finally {
        pending.current--;
        // After a refusal, show what is really saved.
        if (!pending.current) void load();
      }
    });
  };
  const toggle = (key: 'subsystems' | 'awards', value: string) => {
    const on = meta[key].includes(value);
    void save({ [key]: on ? meta[key].filter((v) => v !== value) : [...meta[key], value] } as Partial<EntryMeta>, { [on ? `${key}Remove` : `${key}Add`]: [value] });
  };

  const chip = 'inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs';
  const select = 'h-7 rounded-md border border-border bg-transparent px-1.5 text-xs';
  const workDate = meta.workDate ? new Date(`${meta.workDate}T12:00:00`) : null;

  return (
    <section className="nb-entry-meta my-2 space-y-2 text-sm" aria-label="Entry details">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden /> Work happened on
          <input type="date" className={select} value={meta.workDate ?? ''} disabled={!editable} onChange={(e) => void save({ workDate: e.target.value || null })} aria-label="Work happened on" />
        </label>
        <select className={select} aria-label="Entry type" value={meta.type ?? ''} disabled={!editable} onChange={(e) => void save({ type: e.target.value || null })}>
          <option value="">Type…</option>
          {ENTRY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select className={select} aria-label="Design stage" value={meta.stage ?? ''} disabled={!editable} onChange={(e) => void save({ stage: e.target.value || null })}>
          <option value="">Stage…</option>
          {ENTRY_STAGES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {data.readMinutes > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" aria-hidden /> {data.readMinutes} min read</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Subsystems and awards">
        {meta.subsystems.map((s) => (
          <span key={s} className={chip}><Cog className="size-3" aria-hidden /> {s}
            {editable && <button type="button" aria-label={`Remove subsystem ${s}`} onClick={() => toggle('subsystems', s)}><X className="size-3" /></button>}
          </span>
        ))}
        {meta.awards.map((a) => (
          <span key={a} className={`${chip} border-accent/50`} title={awardById(a)?.criteria}><Award className="size-3 text-accent" aria-hidden /> {awardById(a)?.name ?? a}
            {editable && <button type="button" aria-label={`Remove award ${awardById(a)?.name ?? a}`} onClick={() => toggle('awards', a)}><X className="size-3" /></button>}
          </span>
        ))}
        {editable && (
          <>
            <select className={select} aria-label="Add subsystem" value="" onChange={(e) => { if (e.target.value) toggle('subsystems', e.target.value); }}>
              <option value="">+ Subsystem</option>
              {data.teamSubsystems.filter((s) => !meta.subsystems.includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={select} aria-label="Add award" value="" onChange={(e) => { if (e.target.value) toggle('awards', e.target.value); }}>
              <option value="">+ Award</option>
              {FTC_AWARDS.filter((a) => !meta.awards.includes(a.id)).map((a) => <option key={a.id} value={a.id} title={a.criteria}>{a.name}</option>)}
            </select>
          </>
        )}
        {!editable && !meta.subsystems.length && !meta.awards.length && <span className="text-xs text-muted-foreground"><Plus className="inline size-3" aria-hidden /> No subsystem or award tags</span>}
      </div>
      {(data.writtenBy.length > 0 || data.lastEditedBy) && (
        <p className="text-xs text-muted-foreground">
          {data.writtenBy.length > 0 && <>Written by {data.writtenBy.join(', ')}</>}
          {data.lastEditedBy && <>{data.writtenBy.length > 0 ? ' · ' : ''}last edited by {data.lastEditedBy}</>}
          {workDate && <> · work from {workDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</>}
        </p>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </section>
  );
}
