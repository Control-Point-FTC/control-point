// Reading the offline region pack (src/types/offlinePack.ts): team search,
// team and event pages rebuilt in the same shapes the live API returns, so
// the scouting screens work unchanged with no connection. Pure.
import type { FtcEventFull, FtcMatchFull, FtcPointSplit, FtcTeamEventStats, FtcTeamProfile, FtcTeamSearchHit } from '../types/ftcScout';
import type { OfflinePack, PackEntry, PackEvent, PackScore } from '../types/offlinePack';

/** A downloaded pack older than this is flagged for a re-download. */
export const PACK_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** Age of a pack's data: its last FTC sync, else when it was built. */
export const packAsOf = (pack: Pick<OfflinePack, 'dataAsOf' | 'builtAt'>): string => pack.dataAsOf || pack.builtAt;
export const packStale = (pack: Pick<OfflinePack, 'dataAsOf' | 'builtAt'>, now = Date.now()): boolean => now - Date.parse(packAsOf(pack)) > PACK_STALE_MS;

const freshness = (pack: OfflinePack) => ({ source: 'cache' as const, origin: 'ftc-scout' as const, fetchedAt: packAsOf(pack), cached: true, stale: true });

function nameIndex(pack: OfflinePack): Map<number, string> {
  return new Map(pack.teams.map((t) => [t[0], t[1]]));
}

/** Teams by number (exact first, then prefix) or by name / town words. */
export function packSearch(pack: OfflinePack, q: string, limit = 12): FtcTeamSearchHit[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const hit = (t: OfflinePack['teams'][number]): FtcTeamSearchHit => ({ number: t[0], name: t[1], city: t[2], state: t[3] });
  if (/^\d+$/.test(term)) {
    const exact = pack.teams.filter((t) => String(t[0]) === term);
    const prefix = pack.teams.filter((t) => String(t[0]) !== term && String(t[0]).startsWith(term));
    return [...exact, ...prefix].slice(0, limit).map(hit);
  }
  const words = term.split(/\s+/);
  const score = (t: OfflinePack['teams'][number]) => {
    const name = t[1].toLowerCase(), town = `${t[2] ?? ''} ${t[3] ?? ''}`.toLowerCase();
    if (!words.every((w) => name.includes(w) || town.includes(w))) return -1;
    return name === term ? 3 : name.startsWith(term) ? 2 : words.every((w) => name.includes(w)) ? 1 : 0;
  };
  return pack.teams.map((t) => ({ t, s: score(t) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s || a.t[0] - b.t[0]).slice(0, limit).map((x) => hit(x.t));
}

const split = (s: PackScore | null, opp: PackScore | null): FtcPointSplit | null => (s ? {
  total: s[0], totalNp: s[1], auto: s[2], teleop: s[3], endgame: s[4], penaltiesCommitted: s[5], penaltiesByOpp: opp ? opp[5] : null,
} : null);

function entryStats(e: PackEntry, name: string, awards: string[]): FtcTeamEventStats {
  return { teamNumber: e[0], name, rank: e[1], rp: e[2], wins: e[3], losses: e[4], ties: e[5], qualMatchesPlayed: e[6], opr: null, avg: null, awards };
}

const label = (l: 'q' | 'p', s: number, n: number) => (l === 'q' ? `Q-${n}` : s > 0 ? `M-${s}${n > 1 ? `.${n}` : ''}` : `M-${n}`);

function eventFull(pack: OfflinePack, ev: PackEvent, names: Map<number, string>): FtcEventFull {
  const nameOf = (n: number) => names.get(n) ?? `Team ${n}`;
  const awardsOf = (n: number) => ev.awards.filter((a) => a[2] === n).map((a) => a[0]);
  const matches: FtcMatchFull[] = ev.matches.map((m) => {
    const sur = new Set(m.sur ?? []);
    const side = (teams: number[], s: PackScore | null, opp: PackScore | null) => ({
      teams: teams.map((n) => ({ number: n, name: nameOf(n), ...(sur.has(n) ? { surrogate: true } : {}) })),
      score: split(s, opp),
    });
    const level = m.l === 'q' ? 'qual' as const : 'playoff' as const;
    return {
      key: `${level}:${m.s}:${m.n}`, level, series: m.s, number: m.n, label: label(m.l, m.s, m.n), description: null, time: m.t,
      played: !!(m.rs && m.bs), red: side(m.r, m.rs, m.bs), blue: side(m.b, m.bs, m.rs), breakdownSource: m.rs ? 'ftc-scout' : null,
    };
  });
  return {
    ...freshness(pack), code: ev.code, season: pack.season, name: ev.name, type: ev.type, start: ev.start, end: ev.end,
    venue: null, city: null, state: ev.state, country: ev.country,
    field: ev.teams.map((e) => entryStats(e, nameOf(e[0]), awardsOf(e[0]))).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.teamNumber - b.teamNumber),
    matches, alliances: [],
  };
}

/** An event from the pack, in the live API's shape (null when it isn't in the pack or season). */
export function packEvent(pack: OfflinePack, season: number, code: string): FtcEventFull | null {
  if (season !== pack.season) return null;
  const ev = pack.events.find((e) => e.code.toUpperCase() === code.toUpperCase());
  return ev ? eventFull(pack, ev, nameIndex(pack)) : null;
}

/** A team's season from the pack: its events with ranks and records (no OPRs offline). */
export function packTeamProfile(pack: OfflinePack, season: number, number: number): FtcTeamProfile | null {
  if (season !== pack.season) return null;
  const team = pack.teams.find((t) => t[0] === number);
  const events = pack.events.filter((e) => e.teams.some((t) => t[0] === number));
  if (!team && !events.length) return null;
  const name = team?.[1] ?? `Team ${number}`;
  return {
    ...freshness(pack), number, name, school: null, sponsors: [], city: team?.[2] ?? null, state: team?.[3] ?? null, country: null,
    rookieYear: null, season, seasons: [season], totalTeams: null,
    opr: { tot: null, auto: null, dc: null, eg: null }, oprSource: null,
    events: events.map((e) => ({
      code: e.code, name: e.name, date: e.start, type: e.type, city: null, state: e.state,
      stats: entryStats(e.teams.find((t) => t[0] === number)!, name, e.awards.filter((a) => a[2] === number).map((a) => a[0])),
    })),
  };
}
