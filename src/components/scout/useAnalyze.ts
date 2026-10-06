// Team Stats → Analyze logic shared by Legacy AnalyzeView and the Modern
// Analyze workspace: selection (team detail / side-panel peek), the event
// picker, pins, recents, the workspace shortlist and Bruno's scouting
// context; the event field (latest-wins load, filter / sort / paging); and
// shortlist notes kept in the draft store so a half-written note survives a
// mode switch.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FtcEventFull, FtcTeamEventStats, FtcTeamSearchHit, ShortlistEntry } from '../../types/ftcScout';
import { fetchScoutEvent, fetchScoutTeam, pushRecentTeam, readRecentTeams, searchScoutTeams, type RecentTeam } from '../../services/ftcScoutApi';
import { useDebounced } from '../../hooks/useDebounced';
import { ANALYZE_GREETING, openBruno, setScoutingContext } from '../../services/brunoContext';
import { eventAverages, teamMatches } from '../../utils/ftcAnalysis';
import type { ShortlistPatch } from '../../utils/shortlist';
import { setDraft, useDraft } from '../../modern/drafts';
import { useShortlist } from './useShortlist';
import type { TeamActions } from './CompeteView';

export type AnalyzeTab = 'team' | 'field' | 'shortlist';
export type FieldSortKey = 'rank' | 'opr' | 'auto' | 'teleop' | 'endgame' | 'rp' | 'avgScore' | 'avgPen' | 'number';
export type TeamRef = { number: number; name: string };

const PIN_KEY = 'controlpoint-scout-pins';
function readPins(): RecentTeam[] {
  try { const v = JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); return Array.isArray(v) ? v.filter((t) => t && Number.isInteger(t.number)) : []; } catch { return []; }
}
function writePins(p: RecentTeam[]) { try { localStorage.setItem(PIN_KEY, JSON.stringify(p.slice(0, 12))); } catch { /* storage unavailable */ } }

export function useAnalyzeController({ season, myTeam, initialTeam = null }: { season: number; myTeam: number | null; initialTeam?: TeamRef | null }) {
  const [view, setView] = useState<AnalyzeTab>(initialTeam ? 'team' : 'field');
  const [selected, setSelected] = useState<TeamRef | null>(initialTeam);
  const [panelTeam, setPanelTeam] = useState<TeamRef | null>(null);
  const [eventCode, setEventCode] = useState<string | null>(null);
  const [eventOptions, setEventOptions] = useState<{ code: string; name: string; date: string | null }[]>([]);
  const { entries: shortlist, confirmed: shortlistConfirmed, loaded: shortlistLoaded, error: shortlistErr, patch: patchShortlist, remove: removeEntry } = useShortlist(season);
  // Removing a team also drops its note draft, so re-adding it starts clean.
  const removeFromShortlist = useCallback((n: number) => { clearShortlistNotesDraft(season, n); removeEntry(n); }, [season, removeEntry]);
  const [recent, setRecent] = useState<RecentTeam[]>(readRecentTeams);
  const [pins, setPins] = useState<RecentTeam[]>(readPins);

  // Tell Bruno what we're looking at, and open it with the scouting greeting.
  useEffect(() => {
    // The team open in the side panel wins while it's open.
    setScoutingContext({ mode: 'analyze', season, eventCode, selectedTeam: panelTeam?.number ?? selected?.number ?? null });
  }, [season, eventCode, selected, panelTeam]);
  useEffect(() => {
    openBruno({ greeting: ANALYZE_GREETING });
    return () => setScoutingContext(null);
  }, []);

  // Event picker defaults to the reference team's most recent/upcoming event.
  const refTeam = selected?.number ?? myTeam;
  useEffect(() => {
    let alive = true;
    if (!refTeam) { setEventOptions([]); return; }
    fetchScoutTeam(season, refTeam === myTeam ? null : refTeam)
      .then((p) => {
        if (!alive) return;
        const opts = p.events.map((e) => ({ code: e.code, name: e.name, date: e.date }));
        setEventOptions(opts);
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = opts.filter((o) => o.date && o.date >= today).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
        const recentPlayed = [...p.events].reverse().find((e) => e.stats?.rank != null);
        setEventCode((cur) => (cur && opts.some((o) => o.code === cur) ? cur : upcoming?.code ?? recentPlayed?.code ?? opts[opts.length - 1]?.code ?? null));
      })
      .catch(() => { if (alive) setEventOptions([]); });
    return () => { alive = false; };
  }, [season, refTeam, myTeam]);

  /** Open a team in Team detail. */
  const openTeam = useCallback((number: number, name = `Team ${number}`) => {
    setSelected({ number, name });
    setRecent(pushRecentTeam({ number, name }));
    setView('team');
    setPanelTeam(null);
  }, []);
  /** Peek at a team in the side panel. */
  const peekTeam = useCallback((number: number, name = `Team ${number}`) => {
    setPanelTeam({ number, name });
    setRecent(pushRecentTeam({ number, name }));
  }, []);
  const chooseEvent = useCallback((c: string) => { setEventCode(c); setView('field'); }, []);

  const listed = useCallback((n: number) => shortlist.some((s) => s.teamNumber === n), [shortlist]);
  const addToShortlist = useCallback((n: number, name: string) => {
    if (!shortlistLoaded) return; // season switching: wait for this season's list
    if (listed(n)) { setView('shortlist'); return; }
    patchShortlist({ teamNumber: n, teamName: name || `Team ${n}`, eventCode });
  }, [shortlistLoaded, listed, eventCode, patchShortlist]);
  const pinned = useCallback((n: number) => pins.some((p) => p.number === n), [pins]);
  const togglePin = useCallback((n: number, name: string) => {
    setPins((cur) => { const next = cur.some((p) => p.number === n) ? cur.filter((p) => p.number !== n) : [{ number: n, name }, ...cur]; writePins(next); return next; });
  }, []);

  const actions: TeamActions = { onViewTeam: (n, name) => peekTeam(n, name), onAddShortlist: addToShortlist, shortlisted: listed, onTogglePin: togglePin, pinned };

  return {
    view, setView, selected, panelTeam, setPanelTeam, eventCode, eventOptions, chooseEvent,
    shortlist, shortlistConfirmed, shortlistErr, patchShortlist, removeFromShortlist,
    recent, pins, openTeam, peekTeam, actions,
  };
}

/** One event's field: latest-wins load plus filter / round / alliance / sort / paging. */
export function useEventField(season: number, code: string | null, pageSize = 20) {
  const [ev, setEv] = useState<FtcEventFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: FieldSortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 });
  const [filter, setFilter] = useState('');
  const [round, setRound] = useState<'all' | 'qual' | 'playoff'>('all');
  const [color, setColor] = useState<'all' | 'red' | 'blue'>('all');
  const [page, setPage] = useState(0);

  // Only the latest request may update the view (season/event can change
  // while an older request is still in flight).
  const reqId = useRef(0);
  const load = useCallback((force?: boolean) => {
    const id = ++reqId.current;
    if (!code) { setLoading(false); return; }
    setLoading(true); setErr(null);
    fetchScoutEvent(season, code, { force })
      .then((r) => { if (id === reqId.current) setEv(r); })
      .catch((e) => { if (id === reqId.current) setErr(e instanceof Error ? e.message : 'Could not load the event'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [season, code]);
  useEffect(() => { setEv(null); setPage(0); load(); return () => { reqId.current++; }; }, [load]);

  const avg = useMemo(() => (ev ? eventAverages(ev.field) : null), [ev]);
  const rows = useMemo(() => {
    if (!ev) return [];
    const term = filter.trim().toLowerCase();
    // Round / alliance-color filters keep teams that played matching matches.
    const plays = (t: FtcTeamEventStats) => {
      if (round === 'all' && color === 'all') return true;
      return teamMatches(ev, t.teamNumber).some((p) => (round === 'all' || p.match.level === round) && (color === 'all' || p.alliance === color));
    };
    const val = (t: FtcTeamEventStats): number | null => {
      switch (sort.key) {
        case 'rank': return t.rank;
        case 'opr': return t.opr?.totalNp ?? null;
        case 'auto': return t.opr?.auto ?? null;
        case 'teleop': return t.opr?.teleop ?? null;
        case 'endgame': return t.opr?.endgame ?? null;
        case 'rp': return t.rp;
        case 'avgScore': return t.avg?.total ?? null;
        case 'avgPen': return t.avg?.penaltiesCommitted ?? null;
        case 'number': return t.teamNumber;
      }
    };
    return ev.field
      .filter((t) => !term || String(t.teamNumber).includes(term) || t.name.toLowerCase().includes(term))
      .filter(plays)
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return a.teamNumber - b.teamNumber;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * sort.dir;
      });
  }, [ev, filter, round, color, sort]);
  useEffect(() => setPage(0), [filter, round, color, sort]);

  /** Click a column: toggle its direction, or start with its natural order. */
  const sortBy = useCallback((key: FieldSortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'rank' || key === 'number' || key === 'avgPen' ? 1 : -1 })), []);
  const pageRows = rows.slice(page * pageSize, page * pageSize + pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  return { ev, err, loading, load, avg, rows, pageRows, page, pages, setPage, sort, setSort, sortBy, filter, setFilter, round, setRound, color, setColor };
}

/**
 * A shortlist entry's notes, drafted under the season + team so unsaved
 * text survives a remount (mode switch). A newer value (our own optimistic
 * save, or a teammate's edit) shows instead of the draft, as Legacy did; the
 * draft is retired only once the server has confirmed that text, so a failed
 * save rolls back to what was typed.
 */
const notesKey = (season: number, team: number) => `scout-notes:${season}:${team}`;
export function clearShortlistNotesDraft(season: number, team: number) { setDraft(notesKey(season, team), null); }

export function useShortlistNotes(season: number, e: ShortlistEntry, onPatch: (p: Omit<ShortlistPatch, 'season' | 'teamNumber'>) => void, confirmedNotes?: string | null) {
  const [draft, setDraftValue] = useDraft<{ base: string; text: string } | null>(notesKey(season, e.teamNumber), null);
  const notes = draft && draft.base === e.notes ? draft.text : e.notes;
  const setNotes = useCallback((text: string) => setDraftValue({ base: e.notes, text }), [e.notes, setDraftValue]);
  const save = useCallback(() => { if (notes !== e.notes) onPatch({ notes }); }, [notes, e.notes, onPatch]);
  // Retire the draft once the server holds exactly this text and the entry
  // shows it too (not while an older save is still landing).
  useEffect(() => {
    if (draft && confirmedNotes === draft.text && e.notes === draft.text) setDraftValue(null);
  }, [draft, confirmedNotes, e.notes, setDraftValue]);
  return { notes, setNotes, save };
}

/** Team search by number or name (debounced; stale responses are dropped). */
export function useTeamSearch(season: number) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [hits, setHits] = useState<FtcTeamSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  useEffect(() => {
    const term = dq.trim();
    if (term.length < 2 && !/^\d+$/.test(term)) { setHits([]); setSearchErr(null); setSearching(false); return; }
    const ctrl = new AbortController();
    setSearching(true);
    setSearchErr(null);
    searchScoutTeams(term, season)
      .then((r) => { if (!ctrl.signal.aborted) setHits(r); })
      .catch((e) => { if (!ctrl.signal.aborted) setSearchErr(e instanceof Error ? e.message : 'Search failed'); })
      .finally(() => { if (!ctrl.signal.aborted) setSearching(false); });
    return () => ctrl.abort();
  }, [dq, season]);
  return { q, setQ, dq, hits, searching, searchErr };
}
