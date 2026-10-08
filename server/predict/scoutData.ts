// Predict — FTC Scout match data: the GraphQL queries and the parser that
// turns a raw `eventByCode` response into a season-generic EventRecord.
// Shared by the research scripts (scripts/predict) and the server engine.
import type { AllianceResult, EventRecord, MatchRecord } from "./types.js";

/** Event types that aren't official competition (practice, off-season…). */
export const EXCLUDED_TYPES = new Set(["Scrimmage", "OffSeason", "Kickoff", "Workshop", "DemoExhibition", "VolunteerSignup", "PracticeDay", "Other"]);

/** Event types that send teams to a next level (have advancement). */
export const ADVANCING_TYPES = new Set(["LeagueTournament", "Qualifier", "Championship", "SuperQualifier", "Premier", "FIRSTChampionship"]);

/** Alliance score fields per season (totals + game-part split + RP flags). */
function allianceFields(season: number): string {
  const common = "autoPoints dcPoints penaltyPointsCommitted penaltyPointsByOpp totalPointsNp totalPoints";
  if (season >= 2025) return `${common} dcBasePoints movementRp goalRp patternRp`;
  if (season === 2024) return `${common} dcParkPoints`;
  return `${common} egPoints`;
}

/** Whole event: teams + ranks, awards, every match with alliances and scores. */
export function scoutEventQuery(season: number): string {
  return `query E($season: Int!, $code: String!) {
    eventByCode(season: $season, code: $code) {
      code divisionCode name type start end remote hybrid timezone regionCode updatedAt
      location { state country }
      awards { type placement teamNumber }
      teams { teamNumber team { name location { city state } } stats { __typename ... on TeamEventStats${season} { rank rp wins losses ties qualMatchesPlayed } } }
      matches {
        matchNum series tournamentLevel hasBeenPlayed actualStartTime scheduledStartTime
        teams { teamNumber alliance station surrogate dq onField }
        scores { __typename ... on MatchScores${season} { red { ${allianceFields(season)} } blue { ${allianceFields(season)} } } }
      }
    }
  }`;
}

/** Every event with matches in a season (with last-update times for incremental sync). */
export const SCOUT_EVENT_LIST_QUERY = `query L($season: Int!) {
  eventsSearch(season: $season, hasMatches: true, limit: 10000) { code type start end remote hybrid divisionCode regionCode updatedAt }
}`;

/** Endgame field name per season (see server/ftcScout.ts endgameField). */
function endgameOf(season: number, a: any): number {
  if (season >= 2025) return a.dcBasePoints ?? 0;
  if (season === 2024) return a.dcParkPoints ?? 0;
  return a.egPoints ?? 0;
}

function alliance(season: number, raw: any, teams: number[]): AllianceResult | null {
  if (!raw || typeof raw.totalPointsNp !== "number") return null;
  const auto = raw.autoPoints ?? 0;
  const endgame = endgameOf(season, raw);
  // 2024+: dcPoints already include the endgame; ≤2023 it doesn't.
  const teleop = season >= 2024 ? (raw.dcPoints ?? 0) - endgame : raw.dcPoints ?? 0;
  const out: AllianceResult = {
    teams,
    auto,
    teleop,
    endgame,
    np: raw.totalPointsNp,
    penCommitted: raw.penaltyPointsCommitted ?? 0,
    total: raw.totalPoints ?? raw.totalPointsNp,
  };
  if (season >= 2025) out.bonusRp = { movement: !!raw.movementRp, goal: !!raw.goalRp, pattern: !!raw.patternRp };
  return out;
}

const day = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * Parse a raw FTC Scout `eventByCode` response. Null when the event isn't an
 * official in-person competition or has no played matches.
 * Kept: played matches with scores; robots that were on the field
 * (surrogates included in the lineup, flagged so they don't count for rank).
 */
export function parseScoutEventRecord(resp: any, season: number): EventRecord | null {
  const ev = resp?.data?.eventByCode;
  if (!ev || ev.remote || ev.hybrid || EXCLUDED_TYPES.has(ev.type) || !ev.start) return null;
  const startTime = day(ev.start);
  const ranks = new Map<number, number>();
  for (const t of ev.teams ?? []) if (t.stats?.rank) ranks.set(t.teamNumber, t.stats.rank);
  const matches: MatchRecord[] = [];
  for (const m of ev.matches ?? []) {
    if (!m.hasBeenPlayed || !m.scores) continue;
    const on = (al: string) => (m.teams ?? []).filter((t: any) => t.alliance === al && t.onField !== false).map((t: any) => t.teamNumber as number);
    const sur = (al: string) => (m.teams ?? []).filter((t: any) => t.alliance === al && t.onField !== false && t.surrogate).map((t: any) => t.teamNumber as number);
    const red = alliance(season, m.scores.red, on("Red"));
    const blue = alliance(season, m.scores.blue, on("Blue"));
    if (red && sur("Red").length) red.surrogates = sur("Red");
    if (blue && sur("Blue").length) blue.surrogates = sur("Blue");
    if (!red || !blue || !red.teams.length || !blue.teams.length) continue;
    const level = String(m.tournamentLevel || "").toLowerCase().startsWith("qual") ? "qual" : "playoff";
    const t = Date.parse(m.actualStartTime || m.scheduledStartTime || "") || startTime + (level === "playoff" ? 1e6 : 0) + (m.series ?? 0) * 1e3 + m.matchNum;
    matches.push({ season, eventCode: ev.code, level, series: m.series ?? 0, number: m.matchNum, time: t, red, blue });
  }
  if (!matches.length) return null;
  matches.sort((a, b) => a.time - b.time || (a.level === b.level ? 0 : a.level === "qual" ? -1 : 1) || a.series - b.series || a.number - b.number);
  return {
    season,
    code: ev.code,
    type: ev.type,
    region: ev.regionCode ?? undefined,
    start: ev.start,
    end: ev.end || ev.start,
    startTime,
    teams: (ev.teams ?? []).map((t: any) => t.teamNumber),
    ranks,
    awards: (ev.awards ?? []).filter((a: any) => a.teamNumber).map((a: any) => ({ type: a.type, placement: a.placement, team: a.teamNumber })),
    matches,
  };
}
