// Modern scouting shortlist: Bruno's "scout next" / partner-fit
// recommendations for the selected event, then one card per team with
// priority, scout-next, drafted notes, strength / weakness tags (with
// data-suggested ones) and upcoming matches. No comparisons.
import { useEffect, useState } from 'react';
import { Bot, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Button, Input, Label, Switch, Textarea, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { fmt, relTime } from '../../../components/scout/ScoutUi';
import { scoutWithBruno } from '../../../components/scout/CompeteView';
import { useShortlistNotes } from '../../../components/scout/useAnalyze';
import { fetchScoutEvent } from '../../../services/ftcScoutApi';
import { openBruno } from '../../../services/brunoContext';
import { eventAverages, partnerFit, scoutingPriorities, strengthsWeaknesses, teamMatches } from '../../../utils/ftcAnalysis';
import type { ShortlistPatch } from '../../../utils/shortlist';
import type { FtcEventFull, ShortlistEntry, ShortlistPriority } from '../../../types/ftcScout';
import { EmptyState } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';

type Patch = Omit<ShortlistPatch, 'season' | 'teamNumber'>;

export function ShortlistBoard({ season, entries, onPatch, onRemove, error, eventCode, myTeam, onOpenTeam }: {
  season: number; entries: ShortlistEntry[]; onPatch: (p: Omit<ShortlistPatch, 'season'>) => void; onRemove: (n: number) => void;
  error: string | null; eventCode: string | null; myTeam: number | null; onOpenTeam: (n: number, name: string) => void;
}) {
  const [ev, setEv] = useState<FtcEventFull | null>(null);
  useEffect(() => {
    let alive = true;
    setEv(null);
    if (eventCode) fetchScoutEvent(season, eventCode).then((r) => { if (alive) setEv(r); }).catch(() => { if (alive) setEv(null); });
    return () => { alive = false; };
  }, [season, eventCode]);
  const priorities = ev ? scoutingPriorities(ev.field, entries, myTeam, 5) : [];
  const fit = ev && myTeam ? partnerFit(ev.field, myTeam, 3) : [];
  if (error && !entries.length) return <EmptyState title="Couldn't load the shortlist" description={error} />;
  return (
    <div className="space-y-5">
      {(priorities.length > 0 || fit.length > 0) && (
        <section className="relative overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.05] p-5" aria-label="Bruno recommendations">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-accent" />Bruno recommendations{ev ? ` · ${ev.name}` : ''}</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {priorities.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Scout next</p>
                <ul className="mt-1.5 space-y-1">
                  {priorities.map((p) => <li key={p.teamNumber} className="text-sm"><span className="font-medium tabular-nums">{p.teamNumber}</span> <span className="text-muted-foreground">— {p.why}</span></li>)}
                </ul>
              </div>
            )}
            {fit.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Possible partner fits for {myTeam}</p>
                <ul className="mt-1.5 space-y-1">
                  {fit.map((f) => <li key={f.teamNumber} className="text-sm"><span className="font-medium tabular-nums">{f.teamNumber}</span> {f.name}{f.reasons[0] && <span className="text-muted-foreground"> — {f.reasons[0].text}</span>}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">Suggestions from event averages, not guarantees — watch matches before deciding.</p>
            <Button size="sm" variant="outline" onClick={() => openBruno({ prompt: 'Using our scouting shortlist and the selected event, who should we scout next and why?' })} className="max-sm:h-11"><Bot /> Ask Bruno to explain</Button>
          </div>
        </section>
      )}
      {error && entries.length > 0 && <p className="text-sm text-destructive">{error}</p>}
      {!entries.length ? (
        <EmptyState icon={Star} title="No scouting shortlist teams" description="Add teams from the event field, a team profile, or partner history. Your whole workspace shares this list." />
      ) : (
        <Stagger className="grid gap-4 xl:grid-cols-2">
          {entries.map((e) => (
            <StaggerItem key={e.teamNumber}>
              <ShortlistCard e={e} ev={ev} season={season} onPatch={(p) => onPatch({ ...p, teamNumber: e.teamNumber })} onRemove={() => onRemove(e.teamNumber)} onOpen={() => onOpenTeam(e.teamNumber, e.teamName)} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

const PRIORITY: Record<ShortlistPriority, string> = {
  high: 'data-[state=on]:bg-rose-500/15 data-[state=on]:text-rose-600 dark:data-[state=on]:text-rose-300',
  medium: 'data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-600 dark:data-[state=on]:text-amber-300',
  low: '',
};

function ShortlistCard({ e, ev, season, onPatch, onRemove, onOpen }: { e: ShortlistEntry; ev: FtcEventFull | null; season: number; onPatch: (p: Patch) => void; onRemove: () => void; onOpen: () => void }) {
  const { notes, setNotes, save } = useShortlistNotes(season, e, onPatch);
  const [tagDraft, setTagDraft] = useState('');
  const stats = ev?.field.find((t) => t.teamNumber === e.teamNumber) || null;
  const avg = ev ? eventAverages(ev.field) : null;
  const suggested = stats && avg ? strengthsWeaknesses(stats, avg) : [];
  const upcoming = ev ? teamMatches(ev, e.teamNumber).filter((p) => !p.match.played).slice(0, 3) : [];
  const addTag = (kind: 'strengths' | 'weaknesses', tag: string) => {
    const t = tag.trim().slice(0, 40);
    if (!t || e[kind].includes(t)) return;
    onPatch(kind === 'strengths' ? { addStrengths: [t] } : { addWeaknesses: [t] });
  };
  const removeTag = (kind: 'strengths' | 'weaknesses', t: string) => onPatch(kind === 'strengths' ? { removeStrengths: [t] } : { removeWeaknesses: [t] });
  const id = `sl-${e.teamNumber}`;
  return (
    <article className={cn('h-full rounded-2xl border bg-card p-5', e.scoutNext ? 'border-accent/50' : 'border-border')} aria-labelledby={`${id}-h`}>
      <header className="flex items-start gap-3">
        <button onClick={onOpen} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          <h4 id={`${id}-h`} className="break-words"><span className="font-display text-xl font-semibold tabular-nums">{e.teamNumber}</span> <span className="text-muted-foreground">{e.teamName}</span></h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{stats ? `Rank ${stats.rank ?? '—'} · OPR ${fmt(stats.opr?.totalNp ?? null)} · ${stats.wins != null ? `${stats.wins}-${stats.losses}-${stats.ties}` : 'no record'}` : 'Not at the selected event'} · updated {relTime(e.updatedAt)}</p>
        </button>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${e.teamNumber} from shortlist`} className="text-muted-foreground hover:text-destructive max-sm:size-11"><Trash2 /></Button>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <ToggleGroup type="single" aria-label="Scouting priority" value={e.priority} onValueChange={(v) => { if (v) onPatch({ priority: v as ShortlistPriority }); }}>
          {(['high', 'medium', 'low'] as const).map((p) => <ToggleGroupItem key={p} value={p} className={cn('capitalize max-sm:h-11', PRIORITY[p])}>{p}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch id={`${id}-next`} checked={e.scoutNext} onCheckedChange={(v) => onPatch({ scoutNext: v })} />
          <Label htmlFor={`${id}-next`} className="flex cursor-pointer items-center gap-1"><Star className="size-3.5 text-accent" /> Scout next</Label>
        </div>
        <Button variant="ghost" size="sm" onClick={() => scoutWithBruno(e.teamNumber, e.teamName, season)} className="ml-auto text-accent max-sm:h-11"><Bot /> Scout with Bruno</Button>
      </div>

      <div className="mt-4">
        <Label htmlFor={`${id}-notes`}>Notes</Label>
        <Textarea id={`${id}-notes`} value={notes} onChange={(x) => setNotes(x.target.value)} onBlur={save} rows={3} maxLength={2000}
          placeholder="What did you see? Intake, auto routine, driver, reliability…" className="mt-1.5 resize-y" />
      </div>

      {(['strengths', 'weaknesses'] as const).map((kind) => {
        const hints = suggested.filter((s) => (kind === 'strengths' ? s.kind === 'strength' : s.kind === 'weakness') && !e[kind].includes(s.label));
        return (
          <div key={kind} className="mt-4">
            <p className="text-xs capitalize text-muted-foreground">{kind}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e[kind].map((t) => (
                <Badge key={t} variant={kind === 'strengths' ? 'success' : 'destructive'} className="gap-1 pr-1">
                  {t}
                  <button onClick={() => removeTag(kind, t)} aria-label={`Remove ${t}`} className="rounded p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"><X /></button>
                </Badge>
              ))}
              {hints.map((s) => (
                <button key={s.label} onClick={() => addTag(kind, s.label)} title={`Suggested from data: ${s.detail}`}
                  className="inline-flex min-h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11">
                  <Plus className="size-3" />{s.label}
                </button>
              ))}
              {!e[kind].length && !hints.length && <span className="text-xs text-muted-foreground/70">None yet</span>}
            </div>
          </div>
        );
      })}

      <form onSubmit={(x) => { x.preventDefault(); addTag('strengths', tagDraft); setTagDraft(''); }} className="mt-3 flex flex-wrap gap-2">
        <Input value={tagDraft} onChange={(x) => setTagDraft(x.target.value)} placeholder="Custom tag" aria-label="Custom tag" maxLength={40} className="h-9 min-w-0 flex-1 max-sm:h-11" />
        <Button type="submit" size="sm" variant="outline" className="h-9 max-sm:h-11"><Plus /> Strength</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { addTag('weaknesses', tagDraft); setTagDraft(''); }} className="h-9 max-sm:h-11"><Plus /> Weakness</Button>
      </form>

      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Upcoming at {ev?.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {upcoming.map((p) => (
              <Badge key={p.match.key} variant="outline" className={p.alliance === 'red' ? 'border-red-500/40 text-red-600 dark:text-red-300' : 'border-blue-500/40 text-blue-600 dark:text-blue-300'}>
                {p.match.label}<span className="sr-only"> ({p.alliance} alliance)</span>{p.match.time ? ` · ${new Date(p.match.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
