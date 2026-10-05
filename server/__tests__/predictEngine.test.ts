import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PredictEngine, normType } from "../predict/engine";
import { PredictStore } from "../predict/store";
import type { EventRecord, MatchRecord } from "../predict/types";
import type { FtcEventFull, FtcMatchFull } from "../../src/types/ftcScout";

// ---------------------------------------------------------------------------
// Synthetic history: 12 teams, strength falls with team number.
// ---------------------------------------------------------------------------
const TEAMS = Array.from({ length: 12 }, (_, i) => 100 + i);
const strength = (t: number) => 150 - (t - 100) * 9;

function histEvent(code: string, day: number): EventRecord {
  const start = Date.UTC(2025, 10, day);
  const matches: MatchRecord[] = [];
  for (let k = 0; k < 18; k++) {
    const o = [...TEAMS].sort((a, b) => ((a * 7 + k * 13) % 17) - ((b * 7 + k * 13) % 17));
    const al = (ts: number[]) => {
      const np = ts.reduce((s, t) => s + strength(t) / 2, 0);
      return { teams: ts, auto: np * 0.2, teleop: np * 0.7, endgame: np * 0.1, np, penCommitted: 5, total: np + 5 };
    };
    matches.push({ season: 2025, eventCode: code, level: "qual", series: 0, number: k + 1, time: start + k * 6e5, red: al([o[0], o[1]]), blue: al([o[2], o[3]]) });
  }
  return { season: 2025, code, type: "LeagueMeet", start: new Date(start).toISOString().slice(0, 10), end: new Date(start).toISOString().slice(0, 10), startTime: start, teams: TEAMS, ranks: new Map(), awards: [], matches };
}

const hist = { M1: histEvent("M1", 1), M2: histEvent("M2", 8) } as Record<string, EventRecord>;
const fakeStore = {
  hasSeason: (s: number) => s === 2025,
  eventFiles: () => [{ code: "M1", path: "M1", mtimeMs: 1 }, { code: "M2", path: "M2", mtimeMs: 1 }],
  parseEventFile: (path: string) => hist[path],
  loadAdvancement: () => [{ code: "QPAST", type: "Qualifier", region: "USXX", end: "2025-11-20", advancement: { advancesTo: "STATE", slots: 3, rows: [{ team: 111, status: "FIRST", declined: false }] } }],
} as unknown as PredictStore;

/** A live event payload (FtcEventFull) with a 4-round schedule. */
function liveEvent(opts: { played: number; ranks?: boolean; alliances?: boolean; type?: string } = { played: 0 }): FtcEventFull {
  const matches: FtcMatchFull[] = [];
  let n = 0;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i += 4) {
    const o = [...TEAMS].sort((a, b) => ((a * 5 + r * 11) % 13) - ((b * 5 + r * 11) % 13));
    const played = n < opts.played;
    const side = (ts: number[]) => ({ teams: ts.map((t) => ({ number: t, name: `T${t}` })), score: played ? { total: 120, totalNp: 115, auto: 20, teleop: 80, endgame: 15, penaltiesCommitted: 5, penaltiesByOpp: 5 } : null });
    n++;
    matches.push({ key: `qual:0:${n}`, level: "qual", series: 0, number: n, label: `Q-${n}`, description: null, time: null, played, red: side([o[i], o[i + 1]]), blue: side([o[i + 2], o[i + 3]]), breakdownSource: null });
  }
  return {
    code: "QNOW", season: 2025, name: "Test Qualifier", type: opts.type ?? "Qualifier", start: "2025-12-01", end: "2025-12-01",
    venue: null, city: null, state: null, country: null,
    field: TEAMS.map((t, i) => ({ teamNumber: t, name: `T${t}`, rank: opts.ranks ? i + 1 : null, rp: null, wins: null, losses: null, ties: null, qualMatchesPlayed: null, opr: null, avg: null, awards: [] })),
    matches, alliances: opts.alliances ? [{ number: 1, name: null, captain: 100, picks: [101] }, { number: 2, name: null, captain: 102, picks: [103] }, { number: 3, name: null, captain: 104, picks: [105] }, { number: 4, name: null, captain: 106, picks: [107] }] : [],
    source: "first-events", fetchedAt: new Date().toISOString(),
  } as FtcEventFull;
}

let engine: PredictEngine;
beforeEach(async () => { engine = new PredictEngine(fakeStore, [2025]); await engine.rebuild(); });

describe("PredictEngine", () => {
  it("normalises FIRST and FTC Scout event-type names", () => {
    expect(normType("League Tournament")).toBe("LeagueTournament");
    expect(normType(null)).toBe("");
  });

  it("detects the event stage", () => {
    expect(engine.forecast(liveEvent({ played: 0 }), 100, 200)!.stage).toBe("pre");
    expect(engine.forecast(liveEvent({ played: 5 }), 100, 200)!.stage).toBe("live");
    expect(engine.forecast(liveEvent({ played: 99, ranks: true }), 100, 200)!.stage).toBe("quals");
    expect(engine.forecast(liveEvent({ played: 99, ranks: true, alliances: true }), 100, 200)!.stage).toBe("selected");
  });

  it("explains events it can't forecast", () => {
    expect(engine.unsupportedReason(liveEvent({ played: 0, type: "League Meet" }))).toMatch(/doesn't advance/);
    const parent = { ...liveEvent({ played: 0, alliances: true }), matches: [] };
    expect(engine.unsupportedReason(parent)).toMatch(/divisions/);
    expect(engine.unsupportedReason(liveEvent({ played: 0 }))).toBeNull();
  });

  it("forecasts sensibly: stronger teams advance more, odds sum to the slots", () => {
    const fc = engine.forecast(liveEvent({ played: 0 }), 100, 2000)!;
    const p = new Map(fc.teams.map((t) => [t.team, t.pAdvance]));
    expect(p.get(100)!).toBeGreaterThan(p.get(110)!);
    const expected = fc.teams.reduce((s, t) => s + t.pAdvance, 0);
    expect(expected).toBeGreaterThan(fc.slots - 0.5);
    expect(expected).toBeLessThanOrEqual(fc.slots + 1e-9);
    // Award points are only revealed for the asking team.
    expect(fc.teams.find((t) => t.team === 100)!.points.awards).not.toBeNull();
    expect(fc.teams.find((t) => t.team === 101)!.points.awards).toBeNull();
    expect(fc.matchesOnly?.team).toBe(100);
  });

  it("infers slots and already-qualified teams from earlier same-type events", () => {
    const fc = engine.forecast(liveEvent({ played: 0 }), 100, 200)!;
    expect(fc.slotsSource).toBe("estimated");
    expect(fc.slots).toBe(3);
    expect(fc.prequalified).toContain(111);
    expect(fc.teams.find((t) => t.team === 111)!.pAdvance).toBe(0);
  });

  it("ranks partners for a likely captain, and returns none once alliances are set", async () => {
    const pr = (await engine.partners(liveEvent({ played: 99, ranks: true }), 100, 150, 5))!;
    expect(pr.role).toBe("captain");
    expect(pr.options.length).toBe(5);
    for (let i = 1; i < pr.options.length; i++) expect(pr.options[i - 1].pAdvance).toBeGreaterThanOrEqual(pr.options[i].pAdvance);
    const after = (await engine.partners(liveEvent({ played: 99, ranks: true, alliances: true }), 100))!;
    expect(after.role).toBe("none");
  });

  it("offers captains to a team likely to be picked", async () => {
    const pr = (await engine.partners(liveEvent({ played: 99, ranks: true }), 109, 150, 4))!;
    expect(pr.role).toBe("picked");
    expect(pr.options.every((o) => o.team < 109)).toBe(true);
  });

  it("predicts matches", () => {
    const m = engine.match(2025, [100, 101], [110, 111])!;
    expect(m.pRedWin).toBeGreaterThan(0.8);
    expect(m.red.mean).toBeGreaterThan(m.blue.mean);
  });
});

describe("PredictStore sync", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "predict-")); });

  it("downloads only new or changed events", async () => {
    let listed = [{ code: "A", type: "Qualifier", start: "2025-11-01", end: "2025-11-01", updatedAt: "1" }, { code: "B", type: "LeagueMeet", start: "2025-11-02", end: "2025-11-02", updatedAt: "1" }];
    const fetched: string[] = [];
    const store = new PredictStore(dir, {
      scout: async (q, v) => (q.includes("eventsSearch") ? { data: { eventsSearch: listed } } : (fetched.push(String(v.code)), { data: { eventByCode: { code: v.code } } })),
      advancement: async () => ({ advancesTo: "S", slots: 2, rows: [] }),
      gapMs: 0,
    });
    expect(await store.syncScout(2025)).toBe(2);
    expect(await store.syncScout(2025)).toBe(0);
    listed = [{ ...listed[0], updatedAt: "2" }, listed[1]];
    expect(await store.syncScout(2025)).toBe(1);
    expect(fetched).toEqual(["A", "B", "A"]);
    // Advancement only for finished advancing events (A is a Qualifier; B isn't).
    expect(await store.syncAdvancement(2025, Date.UTC(2026, 0, 1))).toBe(1);
    expect(existsSync(join(dir, "first", "2025", "A.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "first", "2025", "A.json"), "utf8")).advancement.slots).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});
