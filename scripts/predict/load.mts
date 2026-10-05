// Predict research — load the raw FTC Scout cache into season-generic records.
//
// Kept: official, in-person events (no remote/hybrid, scrimmages or
// off-season), played matches with scores, robots that were on the field.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AllianceResult, EventRecord, MatchRecord } from "../../server/predict/types.ts";

const ROOT = join(process.cwd(), ".cache", "predict", "scout");
export const EXCLUDED_TYPES = new Set(["Scrimmage", "OffSeason", "Kickoff", "Workshop", "DemoExhibition", "VolunteerSignup", "PracticeDay", "Other"]);

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

export function loadSeason(season: number): EventRecord[] {
  const dir = join(ROOT, String(season));
  if (!existsSync(dir)) return [];
  const events: EventRecord[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const ev = JSON.parse(readFileSync(join(dir, f), "utf8"))?.data?.eventByCode;
    if (!ev || ev.remote || ev.hybrid || EXCLUDED_TYPES.has(ev.type) || !ev.start) continue;
    const startTime = day(ev.start);
    const ranks = new Map<number, number>();
    for (const t of ev.teams ?? []) if (t.stats?.rank) ranks.set(t.teamNumber, t.stats.rank);
    const matches: MatchRecord[] = [];
    for (const m of ev.matches ?? []) {
      if (!m.hasBeenPlayed || !m.scores) continue;
      // Surrogates play and score, so they stay in the lineup; they're only
      // flagged so ranking simulations don't count the match for them.
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
    if (!matches.length) continue;
    matches.sort((a, b) => a.time - b.time || (a.level === b.level ? 0 : a.level === "qual" ? -1 : 1) || a.series - b.series || a.number - b.number);
    events.push({
      season,
      code: ev.code,
      type: ev.type,
      start: ev.start,
      end: ev.end || ev.start,
      startTime,
      teams: (ev.teams ?? []).map((t: any) => t.teamNumber),
      ranks,
      awards: (ev.awards ?? []).filter((a: any) => a.teamNumber).map((a: any) => ({ type: a.type, placement: a.placement, team: a.teamNumber })),
      matches,
    });
  }
  events.sort((a, b) => a.startTime - b.startTime || a.code.localeCompare(b.code));
  return events;
}
