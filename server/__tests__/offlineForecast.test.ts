/**
 * Offline Predict: the device's forecaster, fed from the pack's JSON, gives
 * the same forecast and alliance options as the server's engine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PredictEngine } from "../predict/engine";
import { RatingBook } from "../predict/rating";
import type { PredictStore } from "../predict/store";
import type { EventRecord, MatchRecord } from "../predict/types";
import type { FtcEventFull, FtcMatchFull } from "../../src/types/ftcScout";
import { OFFLINE_PACK_FORMAT, type OfflinePack } from "../../src/types/offlinePack";
import { OfflineForecaster, offlineForecaster } from "../../src/utils/offlineForecast";

const TEAMS = Array.from({ length: 12 }, (_, i) => 100 + i);
const strength = (t: number) => 150 - (t - 100) * 9;
function histEvent(code: string, day: number): EventRecord {
  const start = Date.UTC(2025, 10, day);
  const matches: MatchRecord[] = [];
  for (let k = 0; k < 18; k++) {
    const o = [...TEAMS].sort((a, b) => ((a * 7 + k * 13) % 17) - ((b * 7 + k * 13) % 17));
    const al = (ts: number[]) => { const np = ts.reduce((s, t) => s + strength(t) / 2, 0); return { teams: ts, auto: np * 0.2, teleop: np * 0.7, endgame: np * 0.1, np, penCommitted: 5, total: np + 5 }; };
    matches.push({ season: 2025, eventCode: code, level: "qual", series: 0, number: k + 1, time: start + k * 6e5, red: al([o[0], o[1]]), blue: al([o[2], o[3]]) });
  }
  const day0 = new Date(start).toISOString().slice(0, 10);
  return { season: 2025, code, type: "Qualifier", start: day0, end: day0, startTime: start, teams: TEAMS, ranks: new Map(), awards: [{ type: "Inspire", placement: 1, team: 103 }], matches };
}
const hist: Record<string, EventRecord> = { USXXQ1: histEvent("USXXQ1", 1), USXXQ2: histEvent("USXXQ2", 8) };
const store = {
  hasSeason: (s: number) => s === 2025,
  index: () => ({ USXXQ1: { code: "USXXQ1", type: "Qualifier", start: null, end: null, region: "USXX", updatedAt: null } }),
  eventFiles: () => Object.keys(hist).map((code) => ({ code, path: code, mtimeMs: 1 })),
  parseEventFile: (p: string) => hist[p],
  loadAdvancement: () => [{ code: "USXXQPAST", type: "Qualifier", region: "USXX", end: "2025-11-20", advancement: { advancesTo: "STATE", slots: 3, rows: [{ team: 111, status: "FIRST", declined: false }, { team: 999, status: "FIRST", declined: false }] } }],
} as unknown as PredictStore;

function liveEvent(played: number): FtcEventFull {
  const matches: FtcMatchFull[] = [];
  let n = 0;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i += 4) {
    const o = [...TEAMS].sort((a, b) => ((a * 5 + r * 11) % 13) - ((b * 5 + r * 11) % 13));
    const isPlayed = n < played;
    const side = (ts: number[]) => ({ teams: ts.map((t) => ({ number: t, name: `T${t}` })), score: isPlayed ? { total: 120, totalNp: 115, auto: 20, teleop: 80, endgame: 15, penaltiesCommitted: 5, penaltiesByOpp: 5 } : null });
    n++;
    matches.push({ key: `qual:0:${n}`, level: "qual", series: 0, number: n, label: `Q-${n}`, description: null, time: null, played: isPlayed, red: side([o[i], o[i + 1]]), blue: side([o[i + 2], o[i + 3]]), breakdownSource: null });
  }
  return {
    code: "USXXQNOW", season: 2025, name: "Now", type: "Qualifier", start: "2025-12-01", end: "2025-12-01", venue: null, city: null, state: null, country: null,
    field: TEAMS.map((t) => ({ teamNumber: t, name: `T${t}`, rank: null, rp: null, wins: null, losses: null, ties: null, qualMatchesPlayed: null, opr: null, avg: null, awards: [] })),
    matches, alliances: [], source: "ftc-scout", fetchedAt: new Date().toISOString(),
  } as FtcEventFull;
}

let engine: PredictEngine;
let pack: OfflinePack;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-11-25T12:00:00Z"));
  engine = new PredictEngine(store, [2025]);
  await engine.rebuild();
  const predict = engine.offlineData(2025, new Set(TEAMS), ["Qualifier"])!;
  // Through JSON, as the device gets it.
  pack = JSON.parse(JSON.stringify({
    format: OFFLINE_PACK_FORMAT, region: "USXX", regionName: "USXX", season: 2025, builtAt: "", dataAsOf: null,
    teams: TEAMS.map((t) => [t, `T${t}`, null, null]),
    events: [{ code: "USXXQNOW", name: "Now", type: "Qualifier", start: "2025-12-01", end: "2025-12-01", region: "USXX", state: null, country: null, teams: [], awards: [], matches: [] }],
    predict,
  }));
});
afterAll(() => { vi.useRealTimers(); });

describe("offline forecast", () => {
  it("matches the server's forecast for the same event", () => {
    const off = offlineForecaster(pack)!;
    expect(off).toBeInstanceOf(OfflineForecaster);
    for (const played of [0, 5]) {
      const ev = liveEvent(played);
      const a = engine.forecast(ev, 100, 400)!;
      const b = off.forecast(ev, 100, 400)!;
      expect({ ...b, generatedAt: "" }).toEqual({ ...a, generatedAt: "" });
    }
  });

  it("matches the server's alliance options", async () => {
    const ev = liveEvent(0);
    expect(await offlineForecaster(pack)!.partners(ev, 100, 200, 4)).toEqual(await engine.partners(ev, 100, 200, 4));
  });

  it("keeps only the pack's teams in advancement rows and ratings", () => {
    expect(pack.predict!.advancement[2025][0].advancement!.rows.map((r) => r.team)).toEqual([111]);
    expect(pack.predict!.book.ratings.every(([t]) => TEAMS.includes(t))).toBe(true);
    expect(pack.predict!.awardSlots.Qualifier).toBeDefined();
    expect(pack.predict!.model).not.toHaveProperty("accuracy");
    expect(offlineForecaster({ ...pack, predict: undefined })).toBeNull();
  });
});

describe("RatingBook data round trip", () => {
  it("survives JSON, including seasons a team skipped", () => {
    const b = new RatingBook();
    b.startSeason(2024);
    for (const m of hist.USXXQ1.matches) b.update({ ...m, season: 2024 });
    b.startSeason(2025);
    b.startSeason(2026); // every team skipped 2025: NaN in history
    const back = RatingBook.fromData(JSON.parse(JSON.stringify(b.toData())));
    for (const t of TEAMS) expect(back.get(t)).toEqual(b.get(t));
    expect(back.priorZ(100)).toEqual(b.priorZ(100));
    expect(RatingBook.fromData(b.toData(new Set([100]))).toData().history.map(([t]) => t)).toEqual([100]);
  });
});
