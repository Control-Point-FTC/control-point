/**
 * Scouting data layer: FTC Scout GraphQL queries + normalizers, and the merge
 * of FIRST Events (primary: teams, rankings, matches, alliances) with FTC
 * Scout (OPR, score breakdowns, per-event stats, team search).
 *
 * Pure functions + injected query/fetchers, so everything here is unit-tested
 * without network access (see server/__tests__/ftcScout.test.ts).
 */
import type {
  FtcAllianceScore,
  FtcAllianceSelection,
  FtcEventFull,
  FtcMatchFull,
  FtcPointSplit,
  FtcTeamEventStats,
  FtcTeamSearchHit,
} from "../src/types/ftcScout.js";
import type { FirstAlliance, FirstEvent, FirstMatch, FirstRanking } from "./ftcEvents.js";
import { matchKey } from "./ftcEvents.js";

/** GraphQL executor (server.ts passes its ftcQuery). Throws on HTTP errors. */
export type ScoutQuery = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

/** Seasons FTC Scout has stat types for (it rejects 2026 queries until it does). */
export const SCOUT_SEASONS = [2022, 2023, 2024, 2025];

// ---------------------------------------------------------------------------
// Season field mapping
// ---------------------------------------------------------------------------

/** Each season names its endgame component differently. */
export function endgameField(season: number): string {
  if (season <= 2023) return "egPoints";
  if (season === 2024) return "dcParkPoints";
  return "dcBasePoints";
}

/**
 * True when the season's `dcPoints` already include the endgame component
 * (2024+ fold ascent/base into driver-controlled), so TeleOp = dc − endgame.
 */
export function dcIncludesEndgame(season: number): boolean {
  return season >= 2024;
}

/** Fields requested from every TeamEventStats<season>Group / MatchScores alliance. */
export function scoutPointFields(season: number): string {
  return `autoPoints dcPoints ${endgameField(season)} penaltyPointsCommitted penaltyPointsByOpp totalPointsNp totalPoints`;
}

export function teamEventStatsFragment(season: number): string {
  const f = scoutPointFields(season);
  return `... on TeamEventStats${season} { rank rp wins losses ties qualMatchesPlayed opr { ${f} } avg { ${f} } }`;
}

export function matchScoresFragment(season: number): string {
  const f = scoutPointFields(season);
  return `... on MatchScores${season} { red { ${f} } blue { ${f} } }`;
}

/** Whole-event query: field stats, awards, every match with score breakdowns. */
export function scoutEventQuery(season: number): string {
  return `query EventFull($season: Int!, $code: String!) {
    eventByCode(season: $season, code: $code) {
      code name type start end timezone address
      location { city state country }
      teams { teamNumber team { name } stats { __typename ${teamEventStatsFragment(season)} } awards { type } }
      matches {
        matchNum series tournamentLevel description hasBeenPlayed scheduledStartTime actualStartTime
        teams { teamNumber station alliance surrogate dq }
        scores { __typename ${matchScoresFragment(season)} }
      }
    }
  }`;
}

/** Per-event stats for one team across a season (Compete event cards). */
export function scoutTeamEventsQuery(season: number): string {
  return `query TeamEvents($number: Int!, $season: Int!) {
    teamByNumber(number: $number) {
      number
      events(season: $season) {
        event { code name start type location { city state } }
        stats { __typename ${teamEventStatsFragment(season)} }
        awards { type }
      }
    }
  }`;
}

export const SCOUT_SEARCH_QUERY = `query Search($q: String!) {
  teamsSearch(searchText: $q, limit: 12) { number name location { city state } }
}`;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}
function round1(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function dateOnly(v: unknown): string | null {
  const s = str(v);
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Map one season-specific points group onto the season-generic split. */
export function normalizePointSplit(raw: unknown, season: number): FtcPointSplit | null {
  if (!isObj(raw)) return null;
  const auto = num(raw.autoPoints);
  const dc = num(raw.dcPoints);
  const eg = num(raw[endgameField(season)]);
  const teleop = dc == null ? null : dcIncludesEndgame(season) && eg != null ? dc - eg : dc;
  const split: FtcPointSplit = {
    total: round1(num(raw.totalPoints)),
    totalNp: round1(num(raw.totalPointsNp)),
    auto: round1(auto),
    teleop: round1(teleop),
    endgame: round1(eg),
    // Same convention as FIRST's scoreRedFoul: positive points the alliance
    // committed (Q-1 USNJCMPPKWY: 15 in both sources). Only OPR values can be
    // negative — that's regression noise, and the analysis uses averages.
    penaltiesCommitted: round1(num(raw.penaltyPointsCommitted)),
    penaltiesByOpp: round1(num(raw.penaltyPointsByOpp)),
  };
  return Object.values(split).some((v) => v != null) ? split : null;
}

export function normalizeTeamEventStats(
  raw: { teamNumber: number; name: string; stats: unknown; awards: unknown },
  season: number
): FtcTeamEventStats {
  const s = isObj(raw.stats) ? raw.stats : {};
  return {
    teamNumber: raw.teamNumber,
    name: raw.name,
    rank: num(s.rank),
    rp: round1(num(s.rp)),
    wins: num(s.wins),
    losses: num(s.losses),
    ties: num(s.ties),
    qualMatchesPlayed: num(s.qualMatchesPlayed),
    opr: normalizePointSplit(s.opr, season),
    avg: normalizePointSplit(s.avg, season),
    awards: arr(raw.awards)
      .map((a) => (isObj(a) ? str(a.type) : null))
      .filter((x): x is string => !!x),
  };
}

function levelOf(raw: unknown): "qual" | "playoff" {
  return (str(raw) || "").toLowerCase().startsWith("qual") ? "qual" : "playoff";
}

export function matchLabel(level: "qual" | "playoff", series: number | null, n: number): string {
  if (level === "qual") return `Q-${n}`;
  return series && series > 0 ? `M-${series}${n > 1 ? `.${n}` : ""}` : `M-${n}`;
}

// ---------------------------------------------------------------------------
// FTC Scout event → season-generic pieces
// ---------------------------------------------------------------------------

export interface ScoutEventParsed {
  code: string;
  name: string;
  type: string | null;
  start: string | null;
  end: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  field: FtcTeamEventStats[];
  matches: FtcMatchFull[];
}

/** Parse an FTC Scout `eventByCode` response. Null when the event is unknown. */
export function parseScoutEvent(resp: unknown, season: number): ScoutEventParsed | null {
  const ev = isObj(resp) && isObj(resp.data) && isObj(resp.data.eventByCode) ? resp.data.eventByCode : null;
  const code = ev ? str(ev.code) : null;
  if (!ev || !code) return null;
  const names = new Map<number, string>();
  const field: FtcTeamEventStats[] = [];
  for (const t of arr(ev.teams)) {
    if (!isObj(t)) continue;
    const n = num(t.teamNumber);
    if (!n) continue;
    const name = (isObj(t.team) && str(t.team.name)) || `Team ${n}`;
    names.set(n, name);
    field.push(normalizeTeamEventStats({ teamNumber: n, name, stats: t.stats, awards: t.awards }, season));
  }
  const nameOf = (n: number) => names.get(n) || `Team ${n}`;
  const matches: FtcMatchFull[] = [];
  const seen = new Set<string>();
  for (const m of arr(ev.matches)) {
    if (!isObj(m)) continue;
    const number = num(m.matchNum);
    if (!number) continue;
    const level = levelOf(m.tournamentLevel);
    const series = num(m.series);
    const key = matchKey({ level, series, matchNumber: number });
    if (seen.has(key)) continue;
    seen.add(key);
    const side = (alliance: "Red" | "Blue"): FtcAllianceScore["teams"] =>
      arr(m.teams)
        .filter((t): t is Record<string, unknown> => isObj(t) && str(t.alliance) === alliance)
        .sort((a, b) => String(a.station).localeCompare(String(b.station)))
        .map((t) => ({ number: num(t.teamNumber) as number, name: nameOf(num(t.teamNumber) as number), surrogate: t.surrogate === true, dq: t.dq === true }))
        .filter((t) => !!t.number);
    const scores = isObj(m.scores) ? m.scores : null;
    const played = m.hasBeenPlayed === true;
    matches.push({
      key,
      level,
      series,
      number,
      label: matchLabel(level, series, number),
      description: str(m.description),
      time: str(m.actualStartTime) || str(m.scheduledStartTime),
      played,
      red: { teams: side("Red"), score: played && scores ? normalizePointSplit(scores.red, season) : null },
      blue: { teams: side("Blue"), score: played && scores ? normalizePointSplit(scores.blue, season) : null },
      breakdownSource: played && scores ? "ftc-scout" : null,
    });
  }
  const loc = isObj(ev.location) ? ev.location : {};
  return {
    code,
    name: str(ev.name) || code,
    type: str(ev.type),
    start: dateOnly(ev.start),
    end: dateOnly(ev.end),
    venue: str(ev.address),
    city: str(loc.city),
    state: str(loc.state),
    country: str(loc.country),
    field,
    matches: sortMatches(matches),
  };
}

export function sortMatches(ms: FtcMatchFull[]): FtcMatchFull[] {
  return [...ms].sort((a, b) =>
    a.level !== b.level ? (a.level === "qual" ? -1 : 1) : (a.series ?? 0) - (b.series ?? 0) || a.number - b.number
  );
}

/** FTC team numbers are at most 6 digits; FTC Scout search also returns junk ids. */
const MAX_TEAM_NUMBER = 999999;

/** Parse FTC Scout team search results. */
export function parseScoutSearch(resp: unknown): FtcTeamSearchHit[] {
  const list = isObj(resp) && isObj(resp.data) ? arr(resp.data.teamsSearch) : [];
  const out: FtcTeamSearchHit[] = [];
  for (const t of list) {
    if (!isObj(t)) continue;
    const n = num(t.number);
    if (!n || n > MAX_TEAM_NUMBER) continue;
    const loc = isObj(t.location) ? t.location : {};
    out.push({ number: n, name: str(t.name) || `Team ${n}`, city: str(loc.city), state: str(loc.state) });
  }
  return out;
}

export interface ScoutTeamEvent {
  code: string;
  name: string;
  date: string | null;
  type: string | null;
  city: string | null;
  state: string | null;
  stats: FtcTeamEventStats;
}

/** Parse per-event stats for one team (teamByNumber.events). */
export function parseScoutTeamEvents(resp: unknown, season: number, teamName: string): ScoutTeamEvent[] {
  const t = isObj(resp) && isObj(resp.data) && isObj(resp.data.teamByNumber) ? resp.data.teamByNumber : null;
  if (!t) return [];
  const n = num(t.number) || 0;
  const out: ScoutTeamEvent[] = [];
  for (const e of arr(t.events)) {
    if (!isObj(e) || !isObj(e.event)) continue;
    const code = str(e.event.code);
    if (!code) continue;
    const loc = isObj(e.event.location) ? e.event.location : {};
    out.push({
      code,
      name: str(e.event.name) || code,
      date: dateOnly(e.event.start),
      type: str(e.event.type),
      city: str(loc.city),
      state: str(loc.state),
      stats: normalizeTeamEventStats({ teamNumber: n, name: teamName, stats: e.stats, awards: e.awards }, season),
    });
  }
  return out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

// ---------------------------------------------------------------------------
// Merge FIRST Events (primary) + FTC Scout (OPR, breakdowns, fallback)
// ---------------------------------------------------------------------------

export interface FirstEventPieces {
  event: FirstEvent;
  teams: { teamNumber: number; name: string }[];
  rankings: FirstRanking[];
  results: FirstMatch[];
  schedule: FirstMatch[];
  alliances: FirstAlliance[];
}

function emptySplit(): FtcPointSplit {
  return { total: null, totalNp: null, auto: null, teleop: null, endgame: null, penaltiesCommitted: null, penaltiesByOpp: null };
}

/**
 * Build the season-generic event payload. FIRST supplies identity, teams,
 * rankings (rank/W-L-T/RP), match list + final scores and alliances; FTC
 * Scout supplies OPR/averages per team and the auto/TeleOp/endgame/penalty
 * breakdowns, and is the whole source when FIRST has nothing.
 */
export function mergeEventFull(
  season: number,
  code: string,
  first: FirstEventPieces | null,
  scout: ScoutEventParsed | null,
  meta: { fetchedAt: string; partial: boolean }
): Omit<FtcEventFull, "source"> & { source: "first-events" | "ftc-scout" } {
  const scoutField = new Map((scout?.field || []).map((t) => [t.teamNumber, t]));
  const scoutMatches = new Map((scout?.matches || []).map((m) => [m.key, m]));

  if (!first) {
    if (!scout) throw new Error("mergeEventFull needs at least one source");
    return {
      code: scout.code, season, name: scout.name, type: scout.type, start: scout.start, end: scout.end,
      venue: scout.venue, city: scout.city, state: scout.state, country: scout.country,
      field: [...scout.field].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.teamNumber - b.teamNumber),
      matches: scout.matches, alliances: [],
      source: "ftc-scout", fetchedAt: meta.fetchedAt, partial: meta.partial,
    };
  }

  const rankBy = new Map(first.rankings.map((r) => [r.teamNumber, r]));
  const firstNames = new Map(first.teams.map((t) => [t.teamNumber, t.name]));
  const teamNumbers = new Set<number>([...firstNames.keys(), ...rankBy.keys(), ...scoutField.keys()]);
  const nameOf = (n: number) => firstNames.get(n) || scoutField.get(n)?.name || `Team ${n}`;

  const field: FtcTeamEventStats[] = [...teamNumbers].map((n) => {
    const r = rankBy.get(n);
    const s = scoutField.get(n);
    return {
      teamNumber: n,
      name: nameOf(n),
      rank: r?.rank ?? s?.rank ?? null,
      rp: r?.rankingPoints ?? s?.rp ?? null,
      wins: r?.wins ?? s?.wins ?? null,
      losses: r?.losses ?? s?.losses ?? null,
      ties: r?.ties ?? s?.ties ?? null,
      qualMatchesPlayed: s?.qualMatchesPlayed ?? null,
      opr: s?.opr ?? null,
      avg: s?.avg ?? null,
      awards: s?.awards ?? [],
    };
  });
  field.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.teamNumber - b.teamNumber);

  // Matches: FIRST results, plus scheduled-but-unplayed; Scout fills breakdowns.
  const byKey = new Map<string, FirstMatch>();
  for (const m of first.results) byKey.set(matchKey(m), m);
  for (const m of first.schedule) if (!byKey.has(matchKey(m))) byKey.set(matchKey(m), m);
  let matches: FtcMatchFull[] = [...byKey.values()].map((m) => {
    const key = matchKey(m);
    const sm = scoutMatches.get(key);
    const played = m.red.score != null && m.blue.score != null;
    const side = (teams: number[], final: number | null, scoutSide: FtcAllianceScore | undefined, auto: number | null, foul: number | null, oppFoul: number | null): FtcAllianceScore => {
      let score: FtcPointSplit | null = null;
      if (played) {
        score = scoutSide?.score ? { ...scoutSide.score } : emptySplit();
        // FIRST is authoritative for the final score, auto and foul points.
        // scoreRedFoul / scoreBlueFoul are the penalty points that alliance
        // COMMITTED (awarded to the opponent): Q-1 at USNJCMPPKWY has red
        // foul 15 with red's own total unchanged and blue's total +15.
        score.total = final;
        if (auto != null) score.auto = auto;
        if (foul != null) score.penaltiesCommitted = foul;
        // Points received = the other alliance's committed fouls, so the
        // no-penalty total stays consistent with FIRST's final score.
        if (oppFoul != null) {
          score.penaltiesByOpp = oppFoul;
          if (final != null) score.totalNp = final - oppFoul;
        }
      }
      return {
        teams: teams.map((n) => ({ number: n, name: nameOf(n), surrogate: scoutSide?.teams.find((t) => t.number === n)?.surrogate, dq: scoutSide?.teams.find((t) => t.number === n)?.dq })),
        score,
      };
    };
    return {
      key,
      level: m.level,
      series: m.series,
      number: m.matchNumber,
      label: matchLabel(m.level, m.series, m.matchNumber),
      description: m.description,
      time: m.time ?? sm?.time ?? null,
      played,
      red: side(m.red.teams, m.red.score, sm?.red, m.red.auto ?? null, m.red.foul ?? null, m.blue.foul ?? null),
      blue: side(m.blue.teams, m.blue.score, sm?.blue, m.blue.auto ?? null, m.blue.foul ?? null, m.red.foul ?? null),
      breakdownSource: played ? (sm?.red.score ? "ftc-scout" : "first-events") : null,
    };
  });
  // Fill gaps from FTC Scout: if FIRST's results request failed (or lags)
  // while its schedule loaded, scheduled rows have no scores — use Scout's
  // played copy of those matches, and add any matches only Scout has.
  if (scout?.matches.length) {
    const scoutByKey = new Map(scout.matches.map((m) => [m.key, m]));
    matches = matches.map((m) => {
      const sm = scoutByKey.get(m.key);
      return !m.played && sm?.played ? { ...sm, time: m.time ?? sm.time } : m;
    });
    const have = new Set(matches.map((m) => m.key));
    for (const sm of scout.matches) if (!have.has(sm.key)) matches.push(sm);
  }

  const alliances: FtcAllianceSelection[] = first.alliances.map((a) => ({
    number: a.number,
    name: a.name,
    captain: a.captain,
    picks: [a.pick1, a.pick2, a.pick3].filter((x): x is number => x != null),
  }));

  return {
    code: first.event.eventCode,
    season,
    name: first.event.name,
    type: first.event.eventType,
    start: first.event.dateStart,
    end: first.event.dateEnd,
    venue: first.event.venue || first.event.address,
    city: first.event.city,
    state: first.event.state,
    country: first.event.country,
    field,
    matches: sortMatches(matches),
    alliances,
    source: "first-events",
    fetchedAt: meta.fetchedAt,
    partial: meta.partial,
  };
}
