/**
 * Offline Predict: the device's forecaster, fed from the pack's JSON, gives
 * the same forecast and alliance options as the server's engine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PredictEngine } from "../predict/engine";
import { RatingBook } from "../predict/rating";
import { predictMatch } from "../predict/matchModel";
import { FITTED_MODEL } from "@control-scout/predict-engine";
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
  const predict = engine.offlineData(2025, new Set(TEAMS), ["Qualifier"], ["USXXQ1", "USXXQNOW"])!;
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
    // The results the ratings include, by event (not whatever scores the pack holds).
    expect(pack.predict!.played.USXXQ1).toHaveLength(18);
    expect(pack.predict!.played.USXXQNOW).toEqual([]);
    expect(offlineForecaster(pack)!.storedPlayedKeys(2025, "USXXQ1").has("qual:0:1")).toBe(true);
  });
});

describe("offline bonus RP odds (engine 2.3)", () => {
  it("the pack carries the server's selected bonus model, and the device's odds equal the server's", () => {
    expect(pack.predict!.bonusModel).toEqual(engine.bonusModel(2025));
    const ev = liveEvent(0);
    const a = engine.forecast(ev, null, 100)!, b = offlineForecaster(pack)!.forecast(ev, null, 100)!;
    expect(a.matches[0].bonus).toBeTruthy();
    expect(b.matches.map((m) => m.bonus)).toEqual(a.matches.map((m) => m.bonus));
  });

  it("uses the pack's model, not the engine's shipped fit (a season fit the server chose)", () => {
    const fit = { model: { movement: [3, 0] as [number, number], goal: [-3, 0] as [number, number], pattern: [0, 0] as [number, number] }, source: "season" as const, samples: 2000 };
    const off = new OfflineForecaster({ ...pack, predict: { ...pack.predict!, bonusModel: fit } } as never);
    const b = off.forecast(liveEvent(0), null, 100)!.matches[0].bonus!;
    expect(b.red[0]).toBeCloseTo(1 / (1 + Math.exp(-3)), 3);
    expect(b.red[1]).toBeCloseTo(1 / (1 + Math.exp(3)), 3);
  });

  it("a pack from before engine 2.3 (no bonus model) shows no bonus odds rather than different ones", () => {
    const { bonusModel: _gone, ...old } = pack.predict!;
    const off = new OfflineForecaster({ ...pack, predict: old } as never);
    expect(off.forecast(liveEvent(0), null, 100)!.matches.every((m) => (m.bonus ?? null) === null)).toBe(true);
  });
});

describe("a rebuild in progress", () => {
  it("never shows a mix of new ratings and old award history", async () => {
    let gen = 1;
    const changing = {
      ...store,
      eventFiles: () => Object.keys(hist).map((code) => ({ code, path: code, mtimeMs: gen })),
      // The second sync changes both results (ratings) and awards.
      parseEventFile: (p: string) => (gen === 1 ? hist[p] : {
        ...hist[p],
        awards: [{ type: "Inspire", placement: 1, team: 105 }],
        matches: hist[p].matches.map((m) => ({ ...m, red: { ...m.red, auto: m.red.auto + 40, np: m.red.np + 40, total: m.red.total + 40 } })),
      }),
    } as unknown as PredictStore;
    const e = new PredictEngine(changing, [2025]);
    await e.rebuild();
    const before = JSON.stringify(e.offlineData(2025, new Set(TEAMS), ["Qualifier"], ["USXXQ1"]));
    gen = 2;
    const running = e.rebuild();
    // Mid-rebuild: the season is re-read and rated before its first yield, but
    // nothing is swapped in yet — still the old, complete snapshot.
    expect(JSON.parse(JSON.stringify(e.offlineData(2025, new Set(TEAMS), ["Qualifier"], ["USXXQ1"])))).toEqual(JSON.parse(before));
    await running;
    const after = e.offlineData(2025, new Set(TEAMS), ["Qualifier"], ["USXXQ1"])!;
    expect(after.awards.map(([t]) => t)).toContain(105);
    expect(JSON.stringify(after.book)).not.toBe(JSON.stringify(JSON.parse(before).book));
  });
});

describe("offline recorded bonus RPs", () => {
  it("the pack carries stored bonus flags and the device's forecaster uses them like the server", async () => {
    const flags = { movement: true, goal: false, pattern: true };
    hist.USXXQ1.matches[0].blue.bonusRp = flags;
    try {
      const e = new PredictEngine(store, [2025]);
      await e.rebuild();
      const predict = JSON.parse(JSON.stringify(e.offlineData(2025, new Set(TEAMS), ["Qualifier"], ["USXXQ1"])));
      expect(predict.bonus.USXXQ1["qual:0:1"]).toEqual([null, flags]);
      const off = offlineForecaster({ ...pack, predict })!;
      const recorded = (off as unknown as { recordedBonus(s: number, c: string, k: string, x: "red" | "blue"): unknown }).recordedBonus;
      expect(recorded.call(off, 2025, "USXXQ1", "qual:0:1", "blue")).toEqual(flags);
      expect(recorded.call(off, 2025, "USXXQ1", "qual:0:1", "red")).toBeNull();
      // A pack from before engine 2.0 has no flags: nothing recorded, so they're sampled.
      expect(recorded.call(offlineForecaster({ ...pack, predict: { ...predict, bonus: undefined } })!, 2025, "USXXQ1", "qual:0:1", "blue")).toBeNull();
    } finally { delete hist.USXXQ1.matches[0].blue.bonusRp; }
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

  it("carries engine 2.0's reliability state, and a pre-2.0 pack falls back to the legacy win odds", () => {
    const b = new RatingBook(FITTED_MODEL.rating);
    b.startSeason(2025);
    for (const m of hist.USXXQ1.matches) b.update(m);
    const opts = { contextual: FITTED_MODEL.contextual, context: { level: "qual" as const } };
    const back = RatingBook.fromData(JSON.parse(JSON.stringify(b.toData())));
    expect(back.reliabilityReady).toBe(true);
    for (const t of TEAMS) expect(back.reliabilityOf(t)).toEqual(b.reliabilityOf(t));
    const now = predictMatch(b, [100, 101], [102, 103], FITTED_MODEL.noise, FITTED_MODEL.calibration, opts);
    expect(now.model).toBe("contextual");
    expect(predictMatch(back, [100, 101], [102, 103], FITTED_MODEL.noise, FITTED_MODEL.calibration, opts).pRedWin).toBe(now.pRedWin);
    // A pack saved before 2.0 has no reliability state: legacy odds, never an invented history.
    const { reliability: _r, stateVersion: _v, ...old } = b.toData();
    const legacy = RatingBook.fromData(old);
    const p = predictMatch(legacy, [100, 101], [102, 103], FITTED_MODEL.noise, FITTED_MODEL.calibration, opts);
    expect(p.model).toBe("legacy");
    expect(p.pRedWin).toBe(predictMatch(b, [100, 101], [102, 103], FITTED_MODEL.noise, FITTED_MODEL.calibration).pRedWin);
  });
});
