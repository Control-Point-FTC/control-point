// Team Stats → Scout (audit H-4): hand-entered scouting that needs no FTC
// data and works offline. Entries save on this device first and sync when
// there's a connection; the per-team table rolls them up.
import { useMemo, useState } from 'react';
import { CloudOff, Download, Loader2, Minus, Pencil, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { datedName, downloadCsv } from '../../../utils/csv';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent,
  SheetDescription, SheetHeader, SheetTitle, Switch, Textarea, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { confirmDialog, notify } from '../../../components/dialog';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { ScoutStorageError, useScouting } from '../../../components/scout/useScouting';
import { currentFtcSeason } from '../../../components/FtcStats';
import { templateById, templateFor, type ScoutEntry, type ScoutField, type ScoutTeamSummary, type ScoutTemplate, type ScoutValue } from '../../../utils/scouting';
import { EmptyState } from '../../ui/page';

const PHASES: { id: ScoutField['phase']; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'teleop', label: 'TeleOp' },
  { id: 'endgame', label: 'Endgame' },
  { id: 'overall', label: 'Overall' },
];

interface Draft {
  uuid?: string;
  /** An edit keeps the sheet it was made with (a newer season sheet must not drop its fields). */
  templateId: string;
  scoutedTeam: string;
  eventCode: string;
  matchLabel: string;
  data: Record<string, ScoutValue>;
  notes: string;
}

const LAST_EVENT_KEY = 'cp-scout-last-event';

export function ScoutingWorkspace({ season, onSeasonChange, teamId, currentMemberId, canManage }: {
  season: number;
  onSeasonChange?: (s: number) => void;
  teamId: number | null | undefined;
  currentMemberId?: number | null;
  canManage?: boolean;
}) {
  const sc = useScouting({ teamId, memberId: currentMemberId, season });
  const template = templateFor(season);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusTeam, setFocusTeam] = useState<number | null>(null);

  const startNew = (team?: number) => {
    let lastEvent = '';
    try { lastEvent = localStorage.getItem(LAST_EVENT_KEY) || ''; } catch { /* storage unavailable */ }
    setDraft({ templateId: template.id, scoutedTeam: team ? String(team) : '', eventCode: lastEvent, matchLabel: '', data: {}, notes: '' });
  };
  const startEdit = (e: ScoutEntry) => setDraft({
    uuid: e.uuid, templateId: templateById(e.templateId) ? e.templateId : template.id,
    scoutedTeam: String(e.scoutedTeam), eventCode: e.eventCode || '', matchLabel: e.matchLabel || '', data: { ...e.data }, notes: e.notes,
  });

  const canEdit = (e: ScoutEntry) => !!canManage || e.scoutMemberId == null || e.scoutMemberId === currentMemberId;

  const submit = () => {
    if (!draft) return;
    const n = parseInt(draft.scoutedTeam, 10);
    if (!Number.isInteger(n) || n <= 0) { notify('Enter the team number you scouted', 'error'); return; }
    try {
      sc.save({
        uuid: draft.uuid, season, scoutedTeam: n, eventCode: draft.eventCode.trim() || null, matchLabel: draft.matchLabel.trim() || null,
        templateId: draft.templateId, data: draft.data, notes: draft.notes.trim(),
      });
    } catch (err) {
      // Not stored anywhere: keep the form (and what was typed) open.
      notify(err instanceof ScoutStorageError ? err.message : 'Could not save this entry', 'error');
      return;
    }
    try { localStorage.setItem(LAST_EVENT_KEY, draft.eventCode.trim()); } catch { /* storage unavailable */ }
    notify(navigator.onLine === false ? 'Saved on this device — it will sync when you’re back online' : 'Scouting saved', 'success');
    setDraft(null);
  };

  const del = async (e: ScoutEntry) => {
    if (!(await confirmDialog({ title: 'Delete this entry?', message: `Team ${e.scoutedTeam}${e.matchLabel ? ` · ${e.matchLabel}` : ''}`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      sc.remove(e);
    } catch (err) {
      notify(err instanceof ScoutStorageError ? err.message.replace('entry', 'deletion') : 'Could not delete this entry', 'error');
    }
  };

  const shown = focusTeam == null ? sc.entries : sc.entries.filter((e) => e.scoutedTeam === focusTeam);
  const numericFields = template.fields.filter((f) => f.type === 'counter' || f.type === 'rating').slice(0, 4);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SyncChip state={sc.state} pending={sc.pending} onRetry={() => void sc.sync()} />
        {onSeasonChange && <SeasonPicker season={season} onChange={(s) => { setFocusTeam(null); onSeasonChange(s); }} />}
        {sc.lastError && (
          <button type="button" onClick={sc.clearError} className="text-xs text-destructive underline-offset-4 hover:underline" title="Dismiss">{sc.lastError}</button>
        )}
        <Button variant="outline" className="ml-auto max-sm:h-11" disabled={!sc.entries.length} onClick={() => downloadCsv(datedName(`scouting-${season}`), sc.entries, [
          { header: 'Team', value: (e) => e.scoutedTeam },
          { header: 'Event', value: (e) => e.eventCode },
          { header: 'Match', value: (e) => e.matchLabel },
          { header: 'Scout', value: (e) => e.scoutName },
          ...template.fields.map((f) => ({ header: fieldLabel(f), value: (e: ScoutEntry) => e.data[f.id] })),
          { header: 'Notes', value: (e) => e.notes },
          { header: 'Updated', value: (e) => new Date(e.updatedAt).toISOString() },
        ])}><Download /> Export CSV</Button>
        <Button className="max-sm:h-11" onClick={() => startNew()}><Plus /> Scout a match</Button>
      </div>
      <p className="text-xs text-muted-foreground">{template.name} sheet. Works without FTC data or Wi-Fi — entries save on this device and sync when you’re online.</p>

      {sc.summary.length === 0 ? (
        <EmptyState icon={Pencil} title="No scouting yet" description="Scout a match to start building notes on the teams at your event." action={<Button onClick={() => startNew()}><Plus /> Scout a match</Button>} />
      ) : (
        <section aria-label="Teams scouted" className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Entries</th>
                {numericFields.map((f) => <th key={f.id} className="px-3 py-2 font-medium">{fieldLabel(f)}</th>)}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sc.summary.map((s) => (
                <tr key={s.team} className={cn('border-t border-border', focusTeam === s.team && 'bg-accent/5')}>
                  <td className="px-3 py-2">
                    <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={() => setFocusTeam(focusTeam === s.team ? null : s.team)} aria-pressed={focusTeam === s.team}>
                      #{s.team}
                    </button>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{s.entries}</td>
                  {numericFields.map((f) => <td key={f.id} className="px-3 py-2 tabular-nums">{s.averages[f.id] != null ? s.averages[f.id].toFixed(1) : '—'}</td>)}
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => startNew(s.team)} aria-label={`Scout team ${s.team} again`}><Plus /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {focusTeam != null && (() => {
        const s = sc.summary.find((x) => x.team === focusTeam);
        return s ? <TeamDetail summary={s} template={template} /> : null;
      })()}

      {shown.length > 0 && (
        <section aria-label="Scouting entries" className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {focusTeam == null ? 'Latest entries' : `Entries for #${focusTeam}`}
            {focusTeam != null && <button type="button" className="ml-2 underline underline-offset-4" onClick={() => setFocusTeam(null)}>Show all</button>}
          </p>
          <ul className="grid gap-2">
            {shown.slice(0, 50).map((e) => (
              <li key={e.uuid} className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">#{e.scoutedTeam}</span>
                  <span className="text-muted-foreground">{[e.eventCode, e.matchLabel, e.scoutName].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{describe(e)}</span>
                  {e.notes && <span className="mt-0.5 block whitespace-pre-wrap text-xs">{e.notes}</span>}
                </span>
                {canEdit(e) && (
                  <span className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit entry for team ${e.scoutedTeam}`} onClick={() => startEdit(e)}><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete entry for team ${e.scoutedTeam}`} onClick={() => void del(e)}><Trash2 /></Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <EntrySheet template={(draft && templateById(draft.templateId)) || template} draft={draft} onChange={setDraft} onClose={() => setDraft(null)} onSubmit={submit} />
    </div>
  );
}

function phaseShort(p: ScoutField['phase']) {
  return p === 'auto' ? 'Auto' : p === 'teleop' ? 'TeleOp' : p === 'endgame' ? 'End' : '';
}

/** "Auto Artifacts scored", but not "Auto Auto points" when the label already says it. */
function fieldLabel(f: ScoutField) {
  const ph = phaseShort(f.phase);
  return !ph || f.label.toLowerCase().startsWith(ph.toLowerCase()) ? f.label : `${ph} ${f.label}`;
}

function describe(e: ScoutEntry): string {
  const t = templateById(e.templateId);
  if (!t) return '';
  return t.fields
    .filter((f) => e.data[f.id] !== undefined && f.type !== 'text')
    .map((f) => {
      const v = e.data[f.id];
      return f.type === 'toggle' ? (v ? f.label : null) : `${fieldLabel(f)}: ${v}`;
    })
    .filter(Boolean)
    .join(' · ');
}

function SeasonPicker({ season, onChange }: { season: number; onChange: (s: number) => void }) {
  const now = currentFtcSeason();
  const seasons = [now, now - 1, now - 2, now - 3].filter((s, i, a) => a.indexOf(s) === i);
  if (!seasons.includes(season)) seasons.push(season);
  return (
    <Select value={String(season)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-36 text-xs" aria-label="Season"><SelectValue /></SelectTrigger>
      <SelectContent>{seasons.map((s) => <SelectItem key={s} value={String(s)}>{s}–{String(s + 1).slice(2)} season</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Everything the rollup knows about one team: averages, toggle rates, usual choices. */
function TeamDetail({ summary, template }: { summary: ScoutTeamSummary; template: ScoutTemplate }) {
  const rows = template.fields
    .map((f) => {
      if ((f.type === 'counter' || f.type === 'rating') && summary.averages[f.id] != null) return { f, v: summary.averages[f.id].toFixed(1) };
      if (f.type === 'toggle' && summary.shares[f.id] != null) return { f, v: `${Math.round(summary.shares[f.id] * 100)}%` };
      if (f.type === 'choice' && summary.modes[f.id] != null) return { f, v: `Usually ${summary.modes[f.id]}` };
      return null;
    })
    .filter(Boolean) as { f: ScoutField; v: string }[];
  return (
    <section aria-label={`Team ${summary.team} summary`} className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-sm font-semibold">#{summary.team} · {summary.entries} {summary.entries === 1 ? 'entry' : 'entries'}{summary.lastEvent ? ` · last at ${summary.lastEvent}` : ''}</p>
      {rows.length ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map(({ f, v }) => (
            <div key={f.id} className="flex justify-between gap-3 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">{fieldLabel(f)}</dt><dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="text-xs text-muted-foreground">Nothing measured yet on this sheet.</p>}
    </section>
  );
}

function SyncChip({ state, pending, onRetry }: { state: string; pending: number; onRetry: () => void }) {
  if (state === 'offline') return <Badge variant="outline" className="gap-1"><CloudOff className="size-3" /> Offline{pending ? ` · ${pending} waiting` : ''}</Badge>;
  if (state === 'syncing') return <Badge variant="outline" className="gap-1"><Loader2 className="size-3 animate-spin" /> Syncing…</Badge>;
  if (state === 'error' || pending) {
    return (
      <Button size="sm" variant="outline" onClick={onRetry} className="h-7 gap-1 text-xs">
        <RefreshCw className="size-3" /> {pending ? `${pending} waiting to sync — retry` : 'Retry sync'}
      </Button>
    );
  }
  return <Badge variant="outline" className="gap-1"><Wifi className="size-3" /> Synced</Badge>;
}

function EntrySheet({ template, draft, onChange, onClose, onSubmit }: {
  template: ScoutTemplate;
  draft: Draft | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const narrow = useIsNarrow();
  const byPhase = useMemo(() => PHASES.map((p) => ({ ...p, fields: template.fields.filter((f) => f.phase === p.id) })).filter((p) => p.fields.length), [template]);
  if (!draft) return null;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setField = (id: string, v: ScoutValue | undefined) => {
    const data = { ...draft.data };
    if (v === undefined) delete data[id]; else data[id] = v;
    set({ data });
  };
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', narrow ? 'max-h-[92dvh]' : 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{draft.uuid ? 'Edit scouting' : 'Scout a match'}</SheetTitle>
          <SheetDescription>{template.name}. Leave anything you didn’t see blank.</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="scout-team">Team #</Label>
                <Input id="scout-team" inputMode="numeric" required autoFocus value={draft.scoutedTeam} onChange={(e) => set({ scoutedTeam: e.target.value.replace(/\D/g, '') })} className="font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="scout-event">Event</Label>
                <Input id="scout-event" value={draft.eventCode} placeholder="e.g. USNJ1" onChange={(e) => set({ eventCode: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="scout-match">Match</Label>
                <Input id="scout-match" value={draft.matchLabel} placeholder="Q12" onChange={(e) => set({ matchLabel: e.target.value })} />
              </div>
            </div>
            {byPhase.map((p) => (
              <fieldset key={p.id} className="grid gap-2">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.label}</legend>
                {p.fields.map((f) => <FieldInput key={f.id} field={f} value={draft.data[f.id]} onChange={(v) => setField(f.id, v)} />)}
              </fieldset>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="scout-notes">Notes</Label>
              <Textarea id="scout-notes" rows={3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Strategy, strengths, problems…" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FieldInput({ field, value, onChange }: { field: ScoutField; value: ScoutValue | undefined; onChange: (v: ScoutValue | undefined) => void }) {
  const id = `scout-f-${field.id}`;
  if (field.type === 'counter') {
    const n = typeof value === 'number' ? value : 0;
    const max = field.max ?? 200;
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
        <span className="text-sm" id={id}>{field.label}</span>
        <span className="flex items-center gap-2" role="group" aria-labelledby={id}>
          <Button type="button" size="icon-sm" variant="outline" aria-label={`${field.label} minus one`} onClick={() => onChange(n > 0 ? n - 1 : undefined)}><Minus /></Button>
          <span className="w-8 text-center font-mono tabular-nums" aria-live="polite">{value === undefined ? '–' : n}</span>
          <Button type="button" size="icon-sm" variant="outline" aria-label={`${field.label} plus one`} onClick={() => onChange(Math.min(n + 1, max))}><Plus /></Button>
        </span>
      </div>
    );
  }
  if (field.type === 'toggle') {
    return (
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
        <span className="text-sm">{field.label}</span>
        <Switch checked={value === true} onCheckedChange={(v) => onChange(v ? true : false)} aria-label={field.label} />
      </label>
    );
  }
  if (field.type === 'choice' || field.type === 'rating') {
    const opts = field.type === 'rating' ? ['1', '2', '3', '4', '5'] : field.options || [];
    return (
      <div className="grid gap-1.5 rounded-lg border border-border px-3 py-2">
        <span className="text-sm">{field.label}{field.type === 'rating' ? ' (1–5)' : ''}</span>
        <ToggleGroup
          type="single" aria-label={field.label} className="flex-wrap justify-start"
          value={value === undefined ? '' : String(value)}
          onValueChange={(v) => onChange(v ? (field.type === 'rating' ? Number(v) : v) : undefined)}
        >
          {opts.map((o) => <ToggleGroupItem key={o} value={o} className="min-w-10 px-3 max-sm:h-10">{o}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Input id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} />
    </div>
  );
}
