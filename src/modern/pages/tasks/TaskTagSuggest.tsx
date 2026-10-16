// Bruno's tag suggestions in the task editor. "Suggest tags" (or, on a new task,
// leaving a meaningful title with no tags yet) asks Bruno for subsystems, award
// evidence and labels. They're added to the form, marked "AI tagged" with Bruno's
// reason on hover, and one click on Undo takes back exactly what Bruno added.
import { useRef, useState } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import { apiFetch } from '../../../services/api';
import { MAX_LABELS, awardById } from '../../../types/taskTags';
import { Button } from '../../../components/ui-kit';

export type TagLists = { subsystems: string[]; awards: string[]; labels: string[] };
const KEYS = ['subsystems', 'awards', 'labels'] as const;
const sameKey = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function useTagSuggest(get: () => { title: string; description: string } & TagLists, apply: (next: TagLists) => void) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [added, setAdded] = useState<(TagLists & { reason: string }) | null>(null);
  const autoTried = useRef(false);
  const inFlight = useRef(false);
  // Whether the member asked (so failures are shown): also true when they click
  // while the automatic request (started by leaving the title) is still running.
  const asked = useRef(false);
  // Each editor session (a task opened, or a fresh draft) has its own number; a
  // reply that lands after the session changed is dropped, never applied elsewhere.
  const session = useRef(0);

  const suggest = async (auto = false) => {
    const f = get();
    if (inFlight.current) { if (!auto) asked.current = true; return; }
    if (f.title.trim().length < 3) { if (!auto) setNote('Give the task a title first.'); return; }
    const mine = session.current;
    const live = () => session.current === mine;
    inFlight.current = true;
    asked.current = !auto;
    setBusy(true);
    if (!auto) setNote(null);
    const say = (msg: string) => { if (live() && asked.current) setNote(msg); };
    try {
      const res = await apiFetch('/api/tasks/suggest-tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: f.title, description: f.description }),
      });
      const d = await res.json().catch(() => ({}));
      if (!live()) return;
      if (!res.ok) { say(d?.error || 'Bruno couldn’t suggest tags this time — try again.'); return; }
      // Only what isn't on the task already (the member's own picks stay theirs).
      const now = get();
      const fresh = Object.fromEntries(KEYS.map((k) => [k, (Array.isArray(d?.[k]) ? d[k] : []).filter((v: unknown): v is string => typeof v === 'string' && !now[k].some((x) => sameKey(x, v)))])) as TagLists;
      // Labels stop at the limit (what doesn't fit isn't added or marked).
      fresh.labels = fresh.labels.slice(0, Math.max(0, MAX_LABELS - now.labels.length));
      if (!KEYS.some((k) => fresh[k].length)) { say('Bruno didn’t find tags that clearly fit this task.'); return; }
      apply(Object.fromEntries(KEYS.map((k) => [k, [...now[k], ...fresh[k]]])) as TagLists);
      setAdded({ ...fresh, reason: typeof d?.reason === 'string' ? d.reason : '' });
      setNote(null);
    } catch {
      say('Bruno isn’t reachable right now — try again in a moment.');
    } finally {
      if (live()) { inFlight.current = false; setBusy(false); }
    }
  };

  /** New task, meaningful title, no tags yet: ask once on its own. */
  const autoSuggest = () => {
    const f = get();
    if (autoTried.current || f.title.trim().length < 6 || KEYS.some((k) => f[k].length)) return;
    autoTried.current = true;
    void suggest(true);
  };

  const undo = () => {
    if (!added) return;
    const now = get();
    apply(Object.fromEntries(KEYS.map((k) => [k, now[k].filter((v) => !added[k].some((a) => sameKey(a, v)))])) as TagLists);
    setAdded(null);
  };

  /**
   * The member changed a tag list: anything of Bruno's they removed is no longer
   * his (adding it back makes it theirs, and Undo leaves it alone).
   */
  const touch = (k: keyof TagLists, next: string[]) => {
    setAdded((a) => {
      if (!a) return a;
      const kept = { ...a, [k]: a[k].filter((v) => next.some((x) => sameKey(x, v))) };
      return KEYS.some((key) => kept[key].length) ? kept : null;
    });
  };

  /** Still-present tags Bruno added (for the "AI tagged" marks). */
  const marked = (k: keyof TagLists, current: string[]) => (added ? current.filter((v) => added[k].some((a) => sameKey(a, v))) : []);

  const reset = () => {
    session.current += 1;
    inFlight.current = false;
    setBusy(false);
    setAdded(null);
    setNote(null);
    autoTried.current = false;
  };

  return { busy, note, added, suggest, autoSuggest, undo, marked, touch, reset };
}

/** "Suggest tags" button, then the AI tagged strip with Bruno's reason and Undo. */
export function AiTagStrip({ s }: { s: ReturnType<typeof useTagSuggest> }) {
  const names = s.added ? [...s.added.subsystems, ...s.added.awards.map((a) => awardById(a)?.name ?? a), ...s.added.labels] : [];
  return (
    <div className="space-y-2">
      {s.added ? (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          <span className="font-medium">AI tagged:</span>
          <span className="min-w-0 flex-1 truncate" title={s.added.reason || undefined}>{names.join(', ')}</span>
          {s.added.reason && <span className="sr-only">Why: {s.added.reason}</span>}
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={s.undo}><Undo2 /> Undo</Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" aria-busy={s.busy} onClick={() => void s.suggest()}>
          <Sparkles /> {s.busy ? 'Bruno is tagging…' : 'Suggest tags'}
        </Button>
      )}
      {s.added?.reason && <p className="text-xs text-muted-foreground">Bruno: {s.added.reason}</p>}
      {s.note && <p className="text-xs text-muted-foreground" role="status">{s.note}</p>}
    </div>
  );
}
