import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PredictMonitor, eventStillOpen } from "../predict/monitor.js";
import type { Forecast, ForecastMatch } from "../predict/engine.js";
import type { EventRecord, MatchRecord } from "../predict/types.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "predict-mon-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const fm = (n: number, pRedWin: number | null, played: ForecastMatch["played"] = null): ForecastMatch => ({
  key: `qual:0:${n}`, label: `Q${n}`, level: "qual", red: [1, 2], blue: [3, 4], pRedWin, redMean: null, blueMean: null, played,
});
const forecast = (stage: Forecast["stage"], matches: ForecastMatch[], teams: [number, number][] = [], prequalified: number[] = []): Forecast => ({
  season: 2025, event: "USXXQ1", stage, runs: 10, slots: 2, slotsSource: "official", prequalified, assumptions: [],
  teams: teams.map(([team, pAdvance]) => ({ team, pAdvance } as any)), matchesOnly: null, matches, generatedAt: "",
});
const side = (total: number) => ({ teams: [1, 2], auto: 0, teleop: total, endgame: 0, np: total, penCommitted: 0, total });
const rec = (n: number, red: number, blue: number): MatchRecord => ({ season: 2025, eventCode: "USXXQ1", level: "qual", series: 0, number: n, time: n, red: side(red), blue: side(blue) });
const event = (matches: MatchRecord[]): EventRecord => ({ season: 2025, code: "USXXQ1", type: "Qualifier", start: "2025-11-01", end: "2025-11-01", startTime: 0, teams: [1, 2, 3, 4], matches, awards: [] } as any);

describe("PredictMonitor", () => {
  it("records unplayed matches first-write-wins and skips played ones", () => {
    const mon = new PredictMonitor(dir);
    expect(mon.record(forecast("pre", [fm(1, 0.7), fm(2, null), fm(3, 0.4, { red: 1, blue: 2 })]))).toBe(true);
    // A later forecast with different odds must not overwrite the pre-match call.
    expect(mon.record(forecast("pre", [fm(1, 0.2)]))).toBe(false);
    expect(mon.preMatch(2025, "USXXQ1", "qual:0:1")).toBe(0.7);
    expect(mon.preMatch(2025, "USXXQ1", "qual:0:2")).toBeNull();
    expect(mon.preMatch(2025, "USXXQ1", "qual:0:3")).toBeNull();
    // Persisted to disk and readable by a fresh monitor.
    expect(JSON.parse(readFileSync(join(dir, "live", "2025", "USXXQ1.json"), "utf8")).matches["qual:0:1"].p).toBe(0.7);
    expect(new PredictMonitor(dir).preMatch(2025, "USXXQ1", "qual:0:1")).toBe(0.7);
  });

  it("annotates played matches with their recorded pre-match odds only", () => {
    const mon = new PredictMonitor(dir);
    mon.record(forecast("pre", [fm(1, 0.8)]));
    const out = mon.annotate(forecast("live", [fm(1, null, { red: 10, blue: 20 }), fm(2, 0.5)]));
    expect(out.matches[0].pre).toBe(0.8);
    expect(out.matches[1].pre).toBeUndefined();
  });

  it("snapshots advancement once per stage and never for the in-progress 'live' stage", () => {
    const mon = new PredictMonitor(dir);
    mon.record(forecast("live", [], [[1, 0.9]]));
    expect(mon.snapshot(2025, "USXXQ1").advancement.pre).toBeUndefined();
    mon.record(forecast("pre", [], [[1, 0.6], [2, 0.3]], [2]));
    mon.record(forecast("pre", [], [[1, 0.1]]));
    expect(mon.snapshot(2025, "USXXQ1").advancement.pre?.teams).toEqual({ 1: 0.6, 2: 0.3 });
  });

  it("scores matches (accuracy, Brier, upsets) and advancement per stage", () => {
    const mon = new PredictMonitor(dir);
    mon.record(forecast("pre", [fm(1, 0.8), fm(2, 0.7), fm(3, 0.6)], [[1, 0.9], [2, 0.2], [3, 0.5]], [3]));
    // Q1 favourite (red) won, Q2 upset (blue won), Q3 tie.
    const ev = event([rec(1, 50, 10), rec(2, 10, 50), rec(3, 30, 30)]);
    const adv = [{ code: "USXXQ1", advancement: { advancesTo: "X", slots: 1, rows: [{ team: 1, status: "FIRST", declined: false }, { team: 2, status: "NONE", declined: false }] } }];
    const live = mon.score(2025, [ev], adv as any);
    expect(live.matches.n).toBe(3);
    expect(live.matches.upsets).toBe(1);
    expect(live.matches.accuracy).toBe(0.5);
    expect(live.matches.brier).toBeCloseTo(((0.8 - 1) ** 2 + 0.7 ** 2 + (0.6 - 0.5) ** 2) / 3, 4);
    // Team 3 was prequalified, so only teams 1 and 2 count.
    expect(live.advancement.pre).toEqual({ n: 2, events: 1, brier: Number((((0.9 - 1) ** 2 + 0.2 ** 2) / 2).toFixed(4)) });
    expect(live.advancement.quals.n).toBe(0);
  });

  it("flags drift only with enough samples and a clear gap", () => {
    const logs: string[] = [];
    const mon = new PredictMonitor(dir, (m) => logs.push(m));
    const base = { matchBrier: 0.18, advancement: { pre: 0.13 } };
    const live = (n: number, b: number) => ({ season: 2025, matches: { n, accuracy: 0.6, brier: b, upsets: 0 }, advancement: { pre: { n: 0, events: 0, brier: 0 }, quals: { n: 0, events: 0, brier: 0 }, selected: { n: 0, events: 0, brier: 0 } }, updatedAt: "" });
    expect(mon.checkDrift(live(100, 0.3), base)).toEqual([]);
    expect(mon.checkDrift(live(500, 0.2), base)).toEqual([]);
    expect(mon.checkDrift(live(500, 0.25), base)).toHaveLength(1);
    expect(logs[0]).toMatch(/DRIFT 2025: match win odds/);
  });

  it("only treats events as open until a day after they end", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(eventStillOpen("2026-03-10", now)).toBe(true);
    expect(eventStillOpen("2026-03-09", now)).toBe(true);
    expect(eventStillOpen("2026-03-07", now)).toBe(false);
    expect(eventStillOpen(null, now)).toBe(true);
  });

  it("never records known answers: finished events, stored results, or advancement after playoffs start", () => {
    const mon = new PredictMonitor(dir);
    // Playoffs played and nothing left → finished event → nothing recorded.
    const done: ForecastMatch = { ...fm(7, null, { red: 1, blue: 2 }), key: "playoff:1:7", level: "playoff" };
    expect(mon.record(forecast("selected", [fm(1, null, { red: 1, blue: 2 }), done], [[1, 0.9]]))).toBe(false);
    expect(mon.snapshot(2025, "USXXQ1").advancement.selected).toBeUndefined();
    // A stale payload lists Q2 as unplayed, but the ratings already hold its result.
    mon.record(forecast("live", [fm(2, 0.6), fm(3, 0.55)]), new Date(), new Set(["qual:0:2"]));
    expect(mon.preMatch(2025, "USXXQ1", "qual:0:2")).toBeNull();
    expect(mon.preMatch(2025, "USXXQ1", "qual:0:3")).toBe(0.55);
    // A playoff match already played: no "after selection" advancement snapshot.
    const playoff: ForecastMatch = { ...fm(1, null, { red: 3, blue: 1 }), key: "playoff:1:1", level: "playoff" };
    mon.record(forecast("selected", [playoff, { ...fm(9, 0.5), key: "playoff:2:1", level: "playoff" }], [[1, 0.7]]));
    expect(mon.snapshot(2025, "USXXQ1").advancement.selected).toBeUndefined();
  });

  it("keeps calls whose write failed and retries them", () => {
    class Flaky extends PredictMonitor {
      fail = true;
      protected write(season: number, code: string, snap: any) { if (this.fail) throw new Error("disk full"); super.write(season, code, snap); }
    }
    const logs: string[] = [];
    const mon = new Flaky(dir, (m) => logs.push(m));
    expect(mon.record(forecast("pre", [fm(1, 0.7)]))).toBe(false);
    expect(logs[0]).toMatch(/will retry/);
    mon.fail = false;
    // No new entries, but the unsaved snapshot is retried.
    expect(mon.record(forecast("pre", [fm(1, 0.1)]))).toBe(true);
    expect(new PredictMonitor(dir).preMatch(2025, "USXXQ1", "qual:0:1")).toBe(0.7);
    mon.fail = true;
    mon.record(forecast("pre", [fm(2, 0.4)]));
    mon.fail = false;
    expect(mon.flush()).toBe(1);
    expect(new PredictMonitor(dir).preMatch(2025, "USXXQ1", "qual:0:2")).toBe(0.4);
  });

  it("still records an after-quals call when quals are done but the playoff schedule isn't out", () => {
    const mon = new PredictMonitor(dir);
    expect(mon.record(forecast("quals", [fm(1, null, { red: 5, blue: 2 }), fm(2, null, { red: 1, blue: 9 })], [[1, 0.8]]))).toBe(true);
    expect(mon.snapshot(2025, "USXXQ1").advancement.quals?.teams).toEqual({ 1: 0.8 });
  });

  it("treats playoffs as started when only the stored results know about them", () => {
    const mon = new PredictMonitor(dir);
    // Stale payload: quals done, no playoff matches listed; stored results already include a playoff match.
    mon.record(forecast("selected", [fm(1, null, { red: 5, blue: 2 })], [[1, 0.8]]), new Date(), new Set(["qual:0:1", "playoff:1:1"]));
    expect(mon.snapshot(2025, "USXXQ1").advancement.selected).toBeUndefined();
  });
});

