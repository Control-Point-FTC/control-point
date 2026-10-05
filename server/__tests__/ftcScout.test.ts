/**
 * Tests for the scouting data layer (server/ftcScout.ts): season field
 * mapping, FTC Scout parsing, and the FIRST Events + FTC Scout merge.
 * Fixtures mirror real response shapes (no network).
 */
import { describe, it, expect } from "vitest";
import {
  endgameField,
  dcIncludesEndgame,
  scoutEventQuery,
  normalizePointSplit,
  parseScoutEvent,
  parseScoutSearch,
  parseScoutTeamEvents,
  mergeEventFull,
  matchLabel,
  type FirstEventPieces,
} from "../ftcScout";

const group2025 = (o: Partial<Record<string, number>>) => ({
  autoPoints: 28.3, dcPoints: 73.4, dcBasePoints: 5.5, penaltyPointsCommitted: -1.5, penaltyPointsByOpp: -7.1, totalPointsNp: 101.6, totalPoints: 94.5, ...o,
});

function scoutEventResp() {
  return {
    data: {
      eventByCode: {
        code: "USNJCMPPKWY", name: "NJ Championship - Parkway Division", type: "Championship",
        start: "2026-03-15T00:00:00", end: "2026-03-15T00:00:00", address: "466 Raider Blvd",
        location: { city: "Hillsborough Township", state: "NJ", country: "USA" },
        teams: [
          { teamNumber: 4215, team: { name: "Hypnotic Robotics" }, stats: { __typename: "TeamEventStats2025", rank: 6, rp: 3.4, wins: 4, losses: 1, ties: 0, qualMatchesPlayed: 5, opr: group2025({}), avg: group2025({ totalPoints: 178.6 }) }, awards: [] },
          { teamNumber: 14481, team: { name: "Don't Blink" }, stats: { __typename: "TeamEventStats2025", rank: 1, rp: 5, wins: 5, losses: 0, ties: 0, qualMatchesPlayed: 5, opr: group2025({ autoPoints: 40 }), avg: null }, awards: [{ type: "Inspire" }] },
          { teamNumber: 999, team: null, stats: null, awards: [] },
        ],
        matches: [
          {
            matchNum: 1, series: 0, tournamentLevel: "Quals", description: "Qualification 1", hasBeenPlayed: true,
            scheduledStartTime: "2026-03-15T11:10:00", actualStartTime: "2026-03-15T11:15:15",
            teams: [
              { teamNumber: 4215, station: "Two", alliance: "Red", surrogate: false, dq: false },
              { teamNumber: 14481, station: "One", alliance: "Red", surrogate: false, dq: false },
              { teamNumber: 17670, station: "One", alliance: "Blue", surrogate: true, dq: false },
            ],
            scores: { __typename: "MatchScores2025", red: group2025({ totalPoints: 171, totalPointsNp: 171, penaltyPointsCommitted: 15 }), blue: group2025({ totalPoints: 242, totalPointsNp: 227, penaltyPointsCommitted: 0 }) },
          },
          { matchNum: 1, series: 1, tournamentLevel: "Playoff", description: "Match 1", hasBeenPlayed: false, teams: [], scores: null },
          { matchNum: 1, series: 2, tournamentLevel: "Playoff", description: "Match 2", hasBeenPlayed: false, teams: [], scores: null },
          { matchNum: 1, series: 2, tournamentLevel: "Playoff", description: "dup", hasBeenPlayed: false, teams: [], scores: null },
        ],
      },
    },
  };
}

describe("season field mapping", () => {
  it("names the endgame component per season", () => {
    expect(endgameField(2022)).toBe("egPoints");
    expect(endgameField(2023)).toBe("egPoints");
    expect(endgameField(2024)).toBe("dcParkPoints");
    expect(endgameField(2025)).toBe("dcBasePoints");
    expect(dcIncludesEndgame(2023)).toBe(false);
    expect(dcIncludesEndgame(2025)).toBe(true);
  });

  it("builds a season-specific event query", () => {
    const q = scoutEventQuery(2024);
    expect(q).toContain("TeamEventStats2024");
    expect(q).toContain("MatchScores2024");
    expect(q).toContain("dcParkPoints");
  });

  it("splits TeleOp from endgame when dc includes it (2024+)", () => {
    const s = normalizePointSplit(group2025({ dcPoints: 73.4, dcBasePoints: 5.5 }), 2025)!;
    expect(s.teleop).toBe(67.9);
    expect(s.endgame).toBe(5.5);
    const old = normalizePointSplit({ autoPoints: 10, dcPoints: 50, egPoints: 20, totalPointsNp: 80 }, 2023)!;
    expect(old.teleop).toBe(50); // dc excludes endgame before 2024
    expect(old.endgame).toBe(20);
  });

  it("returns null for an empty or invalid group", () => {
    expect(normalizePointSplit(null, 2025)).toBeNull();
    expect(normalizePointSplit({ autoPoints: "x" }, 2025)).toBeNull();
  });
});

describe("parseScoutEvent", () => {
  it("parses field stats, awards, alliances by station and score breakdowns", () => {
    const ev = parseScoutEvent(scoutEventResp(), 2025)!;
    expect(ev.code).toBe("USNJCMPPKWY");
    expect(ev.city).toBe("Hillsborough Township");
    expect(ev.field).toHaveLength(3);
    const me = ev.field.find((t) => t.teamNumber === 4215)!;
    expect(me).toMatchObject({ rank: 6, rp: 3.4, wins: 4, losses: 1, ties: 0, qualMatchesPlayed: 5 });
    expect(me.opr?.teleop).toBe(67.9);
    expect(ev.field.find((t) => t.teamNumber === 14481)!.awards).toEqual(["Inspire"]);
    expect(ev.field.find((t) => t.teamNumber === 999)!).toMatchObject({ name: "Team 999", opr: null });

    const q1 = ev.matches[0];
    expect(q1.label).toBe("Q-1");
    expect(q1.red.teams.map((t) => t.number)).toEqual([14481, 4215]); // station One before Two
    expect(q1.blue.teams[0]).toMatchObject({ number: 17670, surrogate: true });
    expect(q1.red.score?.penaltiesCommitted).toBe(15);
    expect(q1.breakdownSource).toBe("ftc-scout");
  });

  it("keeps playoff series distinct and drops duplicates", () => {
    const ev = parseScoutEvent(scoutEventResp(), 2025)!;
    expect(ev.matches.map((m) => m.key)).toEqual(["qual:0:1", "playoff:1:1", "playoff:2:1"]);
    expect(ev.matches[1].red.score).toBeNull();
  });

  it("returns null for an unknown event", () => {
    expect(parseScoutEvent({ data: { eventByCode: null } }, 2025)).toBeNull();
    expect(parseScoutEvent({ errors: [{ message: "invalid season" }] }, 2026)).toBeNull();
  });
});

describe("matchLabel", () => {
  it("labels quals and playoffs", () => {
    expect(matchLabel("qual", 0, 12)).toBe("Q-12");
    expect(matchLabel("playoff", 3, 1)).toBe("M-3");
    expect(matchLabel("playoff", 3, 2)).toBe("M-3.2");
  });
});

describe("parseScoutSearch / parseScoutTeamEvents", () => {
  it("drops junk team ids from search", () => {
    const hits = parseScoutSearch({ data: { teamsSearch: [
      { number: 4215, name: "Hypnotic Robotics", location: { city: "Oradell", state: "NJ" } },
      { number: 202301954, name: "ROBO", location: {} },
      { name: "no number" },
    ] } });
    expect(hits).toEqual([{ number: 4215, name: "Hypnotic Robotics", city: "Oradell", state: "NJ" }]);
  });

  it("parses per-event stats for a team, sorted by date", () => {
    const evs = parseScoutTeamEvents({ data: { teamByNumber: { number: 4215, events: [
      { event: { code: "B", name: "Later", start: "2026-03-01T00:00:00", type: "Championship", location: { city: "X", state: "NJ" } }, stats: { rank: 6, rp: 3, wins: 4, losses: 1, ties: 0, opr: group2025({}), avg: null }, awards: [{ type: "Winner" }] },
      { event: { code: "A", name: "Earlier", start: "2025-11-01T00:00:00" }, stats: null, awards: [] },
    ] } } }, 2025, "Hypnotic Robotics");
    expect(evs.map((e) => e.code)).toEqual(["A", "B"]);
    expect(evs[1].stats).toMatchObject({ teamNumber: 4215, rank: 6, awards: ["Winner"] });
    expect(evs[0].stats.opr).toBeNull();
  });
});

describe("mergeEventFull", () => {
  const meta = { fetchedAt: "2026-10-05T10:00:00.000Z", partial: false };

  function firstPieces(): FirstEventPieces {
    return {
      event: { eventCode: "USNJCMPPKWY", name: "NJ Championship - Parkway Division", eventType: "Championship", venue: null, address: "466 Raider Blvd", city: "Hillsborough", state: "NJ", country: "USA", dateStart: "2026-03-15", dateEnd: "2026-03-15", timezone: null },
      teams: [{ teamNumber: 4215, name: "Hypnotic Robotics" }, { teamNumber: 14481, name: "Don't Blink" }, { teamNumber: 17670, name: "Raider Robotics" }],
      rankings: [
        { teamNumber: 14481, rank: 1, wins: 5, losses: 0, ties: 0, qualAverage: 200, rankingPoints: 5 },
        { teamNumber: 4215, rank: 6, wins: 4, losses: 1, ties: 0, qualAverage: 170, rankingPoints: 3.4 },
      ],
      results: [{ matchNumber: 1, level: "qual", series: 0, description: "Qualification 1", time: "2026-03-15T11:15:15", red: { teams: [14481, 4215], score: 171, auto: 32, foul: 15 }, blue: { teams: [17670], score: 242, auto: 68, foul: 0 } }],
      schedule: [
        { matchNumber: 1, level: "qual", series: 0, description: "Qualification 1", red: { teams: [14481, 4215], score: null }, blue: { teams: [17670], score: null } },
        { matchNumber: 2, level: "qual", series: 0, description: "Qualification 2", red: { teams: [4215], score: null }, blue: { teams: [14481], score: null } },
      ],
      alliances: [{ number: 1, captain: 14481, pick1: 4215, pick2: null, pick3: null, backup: null, name: "Alliance 1" }],
    };
  }

  it("uses FIRST as primary and fills OPR/breakdowns from FTC Scout", () => {
    const ev = mergeEventFull(2025, "USNJCMPPKWY", firstPieces(), parseScoutEvent(scoutEventResp(), 2025), meta);
    expect(ev.source).toBe("first-events");
    expect(ev.name).toBe("NJ Championship - Parkway Division");
    const me = ev.field.find((t) => t.teamNumber === 4215)!;
    expect(me).toMatchObject({ rank: 6, rp: 3.4, wins: 4 }); // FIRST rankings
    expect(me.opr?.totalNp).toBe(101.6); // FTC Scout OPR
    expect(ev.field[0].teamNumber).toBe(14481); // sorted by rank
    expect(ev.alliances).toEqual([{ number: 1, name: "Alliance 1", captain: 14481, picks: [4215] }]);
  });

  it("takes final, auto and committed penalties from FIRST; TeleOp/endgame from Scout", () => {
    const ev = mergeEventFull(2025, "USNJCMPPKWY", firstPieces(), parseScoutEvent(scoutEventResp(), 2025), meta);
    const q1 = ev.matches.find((m) => m.key === "qual:0:1")!;
    expect(q1.played).toBe(true);
    expect(q1.red.score).toMatchObject({ total: 171, auto: 32, penaltiesCommitted: 15, teleop: 67.9, endgame: 5.5 });
    expect(q1.blue.score).toMatchObject({ total: 242, auto: 68, penaltiesCommitted: 0 });
    expect(q1.time).toBe("2026-03-15T11:15:15");
    expect(q1.breakdownSource).toBe("ftc-scout");
    const q2 = ev.matches.find((m) => m.key === "qual:0:2")!;
    expect(q2.played).toBe(false);
    expect(q2.red.score).toBeNull();
  });

  it("falls back to FTC Scout entirely when FIRST has nothing", () => {
    const ev = mergeEventFull(2025, "USNJCMPPKWY", null, parseScoutEvent(scoutEventResp(), 2025), { ...meta, partial: true });
    expect(ev.source).toBe("ftc-scout");
    expect(ev.partial).toBe(true);
    expect(ev.matches).toHaveLength(3);
  });

  it("uses Scout matches when FIRST published none", () => {
    const pieces = { ...firstPieces(), results: [], schedule: [] };
    const ev = mergeEventFull(2025, "USNJCMPPKWY", pieces, parseScoutEvent(scoutEventResp(), 2025), meta);
    expect(ev.matches.map((m) => m.key)).toContain("playoff:2:1");
  });

  it("fills unscored FIRST schedule rows with Scout results when FIRST results failed", () => {
    const pieces = { ...firstPieces(), results: [] };
    const ev = mergeEventFull(2025, "USNJCMPPKWY", pieces, parseScoutEvent(scoutEventResp(), 2025), meta);
    const q1 = ev.matches.find((m) => m.key === "qual:0:1");
    expect(q1?.played).toBe(true);
    expect(q1?.red.score?.total).toBe(171);
    expect(ev.matches.map((m) => m.key)).toContain("playoff:2:1");
    expect(new Set(ev.matches.map((m) => m.key)).size).toBe(ev.matches.length);
  });

  it("derives penalties received and the no-penalty total from FIRST fouls", () => {
    const ev = mergeEventFull(2026, "USNJCMPPKWY", firstPieces(), null, meta);
    const q1 = ev.matches.find((m) => m.key === "qual:0:1")!;
    expect(q1.blue.score).toMatchObject({ total: 242, penaltiesByOpp: 15, totalNp: 227, penaltiesCommitted: 0 });
    expect(q1.red.score).toMatchObject({ total: 171, penaltiesByOpp: 0, totalNp: 171, penaltiesCommitted: 15 });
  });

  it("Scout-only fallback orders the field by rank", () => {
    const parsed = parseScoutEvent(scoutEventResp(), 2025);
    parsed.field.reverse();
    const ev = mergeEventFull(2025, "USNJCMPPKWY", null, parsed, meta);
    const ranks = ev.field.map((t) => t.rank ?? 9999);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("FIRST-only (2026, Scout unsupported) still yields a usable event", () => {
    const ev = mergeEventFull(2026, "USNJCMPPKWY", firstPieces(), null, meta);
    expect(ev.field.find((t) => t.teamNumber === 4215)?.opr).toBeNull();
    expect(ev.matches.find((m) => m.key === "qual:0:1")?.breakdownSource).toBe("first-events");
  });
});
