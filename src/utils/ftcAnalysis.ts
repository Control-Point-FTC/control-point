// Pure scouting calculations shared by the Team Stats UI (Compete / Analyze)
// and the server's Bruno scouting context pack, so Bruno cites exactly the
// numbers the screens show. No network, no React — unit-tested directly.
//
// Deliberately no team-vs-team comparison helpers: everything is a single
// team measured against the event field (averages, ranks), never a
// side-by-side of two teams.
import type {
  FtcEventFull,
  FtcMatchFull,
  FtcPointSplit,
  FtcTeamEventStats,
  FtcTeamEventSummary,
  ShortlistEntry,
} from '../types/ftcScout';

export type Alliance = 'red' | 'blue';
export type MatchResult = 'win' | 'loss' | 'tie';

export const POINT_KEYS = ['totalNp', 'auto', 'teleop', 'endgame'] as const;
export type PointKey = (typeof POINT_KEYS)[number];
export const POINT_LABELS: Record<PointKey, string> = {
  totalNp: 'Total (no penalties)',
  auto: 'Autonomous',
  teleop: 'TeleOp',
  endgame: 'Endgame',
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function mean(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** Win rate with ties as half a win; null when no decided/tied matches. */
export function winRate(wins: number | null, losses: number | null, ties: number | null): number | null {
  const w = wins ?? 0, l = losses ?? 0, t = ties ?? 0;
  const n = w + l + t;
  return n > 0 ? Math.round(((w + t / 2) / n) * 1000) / 10 : null; // percent, 1 dp
}

/** Percentile for a rank out of N (rank 1 → ~100th). */
export function percentile(rank: number | null, total: number | null | undefined): number | null {
  if (rank == null || !total || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - (rank - 1) / total) * 100)));
}

// ---------------------------------------------------------------------------
// Matches from one team's perspective
// ---------------------------------------------------------------------------

export interface MatchPerspective {
  match: FtcMatchFull;
  alliance: Alliance;
  result: MatchResult | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  /** Penalty points this team's alliance gave away. */
  penaltiesCommitted: number | null;
  partners: number[];
  opponents: number[];
}

export function allianceOf(match: FtcMatchFull, team: number): Alliance | null {
  if (match.red.teams.some((t) => t.number === team)) return 'red';
  if (match.blue.teams.some((t) => t.number === team)) return 'blue';
  return null;
}

export function perspective(match: FtcMatchFull, team: number): MatchPerspective | null {
  const alliance = allianceOf(match, team);
  if (!alliance) return null;
  const mine = alliance === 'red' ? match.red : match.blue;
  const theirs = alliance === 'red' ? match.blue : match.red;
  const scoreFor = mine.score?.total ?? null;
  const scoreAgainst = theirs.score?.total ?? null;
  let result: MatchResult | null = null;
  if (match.played && scoreFor != null && scoreAgainst != null) {
    result = scoreFor > scoreAgainst ? 'win' : scoreFor < scoreAgainst ? 'loss' : 'tie';
  }
  // Penalties committed by my alliance = foul points the opponent received.
  const penaltiesCommitted = mine.score?.penaltiesCommitted ?? theirs.score?.penaltiesByOpp ?? null;
  return {
    match,
    alliance,
    result,
    scoreFor,
    scoreAgainst,
    penaltiesCommitted,
    partners: mine.teams.map((t) => t.number).filter((n) => n !== team),
    opponents: theirs.teams.map((t) => t.number),
  };
}

export function teamMatches(event: Pick<FtcEventFull, 'matches'>, team: number): MatchPerspective[] {
  return event.matches.map((m) => perspective(m, team)).filter((p): p is MatchPerspective => !!p);
}

export interface Record3 { wins: number; losses: number; ties: number; played: number; winRate: number | null }

export function recordOf(ps: MatchPerspective[]): Record3 {
  let wins = 0, losses = 0, ties = 0;
  for (const p of ps) {
    if (p.result === 'win') wins++;
    else if (p.result === 'loss') losses++;
    else if (p.result === 'tie') ties++;
  }
  return { wins, losses, ties, played: wins + losses + ties, winRate: winRate(wins, losses, ties) };
}

// ---------------------------------------------------------------------------
// Event field context
// ---------------------------------------------------------------------------

export interface EventAverages {
  teams: number;
  opr: Record<PointKey, number | null>;
  avgScore: number | null;
  avgPenaltiesCommitted: number | null;
  rp: number | null;
}

/** Field-wide averages (the "event average" every team is measured against). */
export function eventAverages(field: FtcTeamEventStats[]): EventAverages {
  const opr = {} as Record<PointKey, number | null>;
  for (const k of POINT_KEYS) opr[k] = mean(field.map((t) => t.opr?.[k]));
  return {
    teams: field.length,
    opr,
    avgScore: mean(field.map((t) => t.avg?.total)),
    avgPenaltiesCommitted: mean(field.map((t) => t.avg?.penaltiesCommitted)),
    rp: mean(field.map((t) => t.rp)),
  };
}

/** Rank of a team within the field for one OPR component (1 = best). */
export function componentRank(field: FtcTeamEventStats[], team: number, key: PointKey): number | null {
  const withVal = field.filter((t) => t.opr?.[key] != null).sort((a, b) => (b.opr![key]! - a.opr![key]!));
  const i = withVal.findIndex((t) => t.teamNumber === team);
  return i >= 0 ? i + 1 : null;
}

export interface StrengthTag { label: string; kind: 'strength' | 'weakness'; detail: string }

/**
 * Strengths / weaknesses of ONE team relative to the event average (never to
 * another team). A component counts when it's ≥15% above / below the field.
 */
export function strengthsWeaknesses(stats: FtcTeamEventStats | null, avg: EventAverages): StrengthTag[] {
  if (!stats?.opr) return [];
  const tags: StrengthTag[] = [];
  for (const k of ['auto', 'teleop', 'endgame'] as const) {
    const v = stats.opr[k];
    const a = avg.opr[k];
    if (v == null || a == null || a <= 0) continue;
    const ratio = v / a;
    if (ratio >= 1.15) tags.push({ label: `Strong ${POINT_LABELS[k].toLowerCase()}`, kind: 'strength', detail: `${POINT_LABELS[k]} OPR ${v} vs event avg ${a}` });
    else if (ratio <= 0.85) tags.push({ label: `Weak ${POINT_LABELS[k].toLowerCase()}`, kind: 'weakness', detail: `${POINT_LABELS[k]} OPR ${v} vs event avg ${a}` });
  }
  const pen = stats.avg?.penaltiesCommitted;
  const penAvg = avg.avgPenaltiesCommitted;
  if (pen != null && penAvg != null) {
    if (pen > penAvg * 1.25 && pen - penAvg >= 2) tags.push({ label: 'High penalties', kind: 'weakness', detail: `${pen} penalty pts/match vs event avg ${penAvg}` });
    else if (pen < penAvg * 0.75) tags.push({ label: 'Clean play', kind: 'strength', detail: `${pen} penalty pts/match vs event avg ${penAvg}` });
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Season trends (one team, event by event)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  code: string;
  label: string;
  date: string | null;
  opr: number | null;
  auto: number | null;
  teleop: number | null;
  endgame: number | null;
  winRate: number | null;
  avgScore: number | null;
  avgPenalties: number | null;
  rp: number | null;
  rank: number | null;
}

export function seasonTrend(events: FtcTeamEventSummary[]): TrendPoint[] {
  return events
    .filter((e) => e.stats)
    .map((e) => {
      const s = e.stats!;
      return {
        code: e.code,
        label: e.name,
        date: e.date,
        opr: s.opr?.totalNp ?? null,
        auto: s.opr?.auto ?? null,
        teleop: s.opr?.teleop ?? null,
        endgame: s.opr?.endgame ?? null,
        winRate: winRate(s.wins, s.losses, s.ties),
        avgScore: s.avg?.total ?? null,
        avgPenalties: s.avg?.penaltiesCommitted ?? null,
        rp: s.rp,
        rank: s.rank,
      };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** Simple direction of a series: last value vs first, ±5% dead-band. */
export function trendDirection(values: (number | null)[]): 'up' | 'down' | 'flat' | null {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length < 2) return null;
  const first = xs[0], last = xs[xs.length - 1];
  if (first === 0) return last > 0 ? 'up' : 'flat';
  const change = (last - first) / Math.abs(first);
  return change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
}

// ---------------------------------------------------------------------------
// Partners & opponents (one team's history)
// ---------------------------------------------------------------------------

export interface PartnerRow {
  number: number;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number | null;
  /** Our alliance's average score in these matches. */
  avgScore: number | null;
  /** Our alliance's average penalties committed in these matches. */
  avgPenalties: number | null;
  events: string[];
}

function rowsFrom(map: Map<number, { name: string; ps: MatchPerspective[]; events: Set<string> }>): PartnerRow[] {
  return [...map.entries()]
    .map(([number, v]) => {
      const r = recordOf(v.ps);
      return {
        number,
        name: v.name,
        matches: v.ps.length,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        winRate: r.winRate,
        avgScore: mean(v.ps.map((p) => p.scoreFor)),
        avgPenalties: mean(v.ps.map((p) => p.penaltiesCommitted)),
        events: [...v.events],
      };
    })
    .sort((a, b) => b.matches - a.matches || (b.winRate ?? -1) - (a.winRate ?? -1) || a.number - b.number);
}

export function partnersAndOpponents(events: FtcEventFull[], team: number): { partners: PartnerRow[]; opponents: PartnerRow[] } {
  const partners = new Map<number, { name: string; ps: MatchPerspective[]; events: Set<string> }>();
  const opponents = new Map<number, { name: string; ps: MatchPerspective[]; events: Set<string> }>();
  for (const ev of events) {
    for (const p of teamMatches(ev, team)) {
      if (!p.match.played) continue;
      const add = (map: typeof partners, n: number) => {
        const side = [...p.match.red.teams, ...p.match.blue.teams].find((t) => t.number === n);
        const cur = map.get(n) || { name: side?.name || `Team ${n}`, ps: [], events: new Set<string>() };
        cur.ps.push(p);
        cur.events.add(ev.code);
        map.set(n, cur);
      };
      p.partners.forEach((n) => add(partners, n));
      p.opponents.forEach((n) => add(opponents, n));
    }
  }
  return { partners: rowsFrom(partners), opponents: rowsFrom(opponents) };
}

// ---------------------------------------------------------------------------
// Partner fit & scouting priority (recommendations, explained)
// ---------------------------------------------------------------------------

export interface FitReason { text: string }
export interface PartnerFit {
  teamNumber: number;
  name: string;
  score: number;
  reasons: FitReason[];
  cautions: FitReason[];
}

/**
 * Teams at the event whose strengths cover MY team's below-average
 * components (measured against the event average, not against each other),
 * with penalty discipline as a caution. Returns the top N with reasons.
 */
export function partnerFit(field: FtcTeamEventStats[], myTeam: number, limit = 5): PartnerFit[] {
  const avg = eventAverages(field);
  const me = field.find((t) => t.teamNumber === myTeam) || null;
  const comps = ['auto', 'teleop', 'endgame'] as const;
  // How much each component matters for us: our deficit vs the field (≥ small floor).
  const need: Record<(typeof comps)[number], number> = { auto: 1, teleop: 1, endgame: 1 };
  for (const k of comps) {
    const a = avg.opr[k];
    const v = me?.opr?.[k];
    if (a != null && a > 0 && v != null) need[k] = Math.max(0.25, 1 + (a - v) / a);
  }
  const out: PartnerFit[] = [];
  for (const t of field) {
    if (t.teamNumber === myTeam || !t.opr) continue;
    let score = 0;
    const reasons: FitReason[] = [];
    const cautions: FitReason[] = [];
    for (const k of comps) {
      const a = avg.opr[k];
      const v = t.opr[k];
      if (a == null || a <= 0 || v == null) continue;
      const surplus = (v - a) / a;
      score += surplus * need[k];
      if (surplus >= 0.15 && need[k] > 1) {
        reasons.push({ text: `${POINT_LABELS[k]} OPR ${v} (event avg ${a}) covers our ${POINT_LABELS[k].toLowerCase()} gap (ours ${me?.opr?.[k] ?? '—'})` });
      } else if (surplus >= 0.25) {
        reasons.push({ text: `${POINT_LABELS[k]} OPR ${v} is well above the event avg ${a}` });
      }
    }
    const pen = t.avg?.penaltiesCommitted;
    if (pen != null && avg.avgPenaltiesCommitted != null && pen > avg.avgPenaltiesCommitted * 1.25 && pen - avg.avgPenaltiesCommitted >= 2) {
      score -= 0.3;
      cautions.push({ text: `Gives away ${pen} penalty pts/match (event avg ${avg.avgPenaltiesCommitted})` });
    }
    if (t.rank != null) reasons.push({ text: `Qual rank #${t.rank}${t.wins != null ? ` (${t.wins}-${t.losses}-${t.ties})` : ''}` });
    out.push({ teamNumber: t.teamNumber, name: t.name, score: Math.round(score * 100) / 100, reasons, cautions });
  }
  return out.sort((a, b) => b.score - a.score || a.teamNumber - b.teamNumber).slice(0, limit);
}

export interface ScoutPriority { teamNumber: number; name: string; why: string }

/**
 * Who to scout next: shortlist entries flagged "scout next" first, then
 * highly ranked teams with missing/thin data (few quals played or no OPR),
 * then the strongest shortlist entries still unscouted (no notes yet).
 */
export function scoutingPriorities(field: FtcTeamEventStats[], shortlist: ShortlistEntry[], myTeam: number | null, limit = 5): ScoutPriority[] {
  const out: ScoutPriority[] = [];
  const seen = new Set<number>(myTeam != null ? [myTeam] : []);
  const push = (n: number, name: string, why: string) => {
    if (seen.has(n) || out.length >= limit) return;
    seen.add(n);
    out.push({ teamNumber: n, name, why });
  };
  for (const s of shortlist.filter((s) => s.scoutNext)) push(s.teamNumber, s.teamName, 'Marked "scout next" on the shortlist');
  for (const t of [...field].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))) {
    if (t.rank != null && t.rank <= 12 && (!t.opr || (t.qualMatchesPlayed ?? 0) < 3)) {
      push(t.teamNumber, t.name, `Ranked #${t.rank} but ${!t.opr ? 'no OPR data yet' : `only ${t.qualMatchesPlayed} quals played`} — watch them live`);
    }
  }
  for (const s of shortlist.filter((s) => !s.notes.trim()).sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0))) {
    push(s.teamNumber, s.teamName, `On the shortlist (${s.priority} priority) with no scouting notes yet`);
  }
  return out;
}

/** Human-readable list of fields missing from a team's event stats. */
export function missingFields(stats: FtcTeamEventStats | null): string[] {
  if (!stats) return ['all event stats'];
  const m: string[] = [];
  if (stats.rank == null) m.push('qualification rank');
  if (stats.wins == null) m.push('W-L-T record');
  if (stats.rp == null) m.push('ranking points');
  if (!stats.opr) m.push('OPR');
  else if (stats.opr.endgame == null) m.push('endgame OPR');
  if (!stats.avg) m.push('average score / penalties');
  return m;
}

export function fmtSplit(s: FtcPointSplit | null): string {
  if (!s) return 'n/a';
  const f = (v: number | null) => (v == null ? '—' : String(v));
  return `total ${f(s.totalNp)} (auto ${f(s.auto)}, TeleOp ${f(s.teleop)}, endgame ${f(s.endgame)})`;
}
