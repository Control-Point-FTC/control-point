// Predict — live monitoring (phase 4: ship and monitor).
//
// The first time the engine forecasts a match that hasn't been played, its
// pre-match win odds are written down; the first forecast of an event at each
// stage (before the event, after quals, after alliance selection) has its
// advancement odds written down. Nothing is ever overwritten, so later
// forecasts can't "learn" the answer. Once results and FIRST advancement lists
// arrive, those snapshots are scored — the live counterpart of the back-test
// in model.json — and drift from the back-test is logged.
//
// Snapshots live as JSON files under <PREDICT_DATA_DIR>/live/<season>/<code>.json
// (no database tables).
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { accuracy as accuracyOf, brier, type ProbOutcome } from "./metrics.js";
import type { EventRecord } from "./types.js";
import type { Forecast, Stage } from "./engine.js";
import type { FirstAdvancement } from "../ftcEvents.js";

export type SnapStage = Exclude<Stage, "live">;
export interface EventSnapshot {
  season: number;
  code: string;
  /** Match key (`level:series:number`) → red's win probability before the match. */
  matches: Record<string, { p: number; at: string }>;
  /** Stage → team → advancement probability, from the first forecast at that stage. */
  advancement: Partial<Record<SnapStage, { at: string; teams: Record<string, number>; excluded: number[] }>>;
}

export interface StageScore { n: number; events: number; brier: number }
export interface LiveAccuracy {
  season: number;
  matches: { n: number; accuracy: number; brier: number; upsets: number };
  advancement: Record<SnapStage, StageScore>;
  updatedAt: string;
}

export interface DriftBaseline { matchBrier: number; advancement: Partial<Record<SnapStage, number>> }

/**
 * Snapshots are only taken while an event can still surprise us: a finished
 * event's forecast is built from ratings that already include its results.
 * `end` is the event's last day (YYYY-MM-DD); one day of grace covers time zones.
 */
export function eventStillOpen(end: string | null | undefined, now = new Date()): boolean {
  if (!end) return true;
  return Date.parse(`${end}T23:59:59Z`) + 864e5 >= now.getTime();
}

/** Matches/stage samples needed before drift is judged at all. */
const MIN_MATCHES = 300;
const MIN_TEAMS = 200;
/** Brier worse than the back-test by more than this is reported. */
const MATCH_TOLERANCE = 0.03;
const ADV_TOLERANCE = 0.04;

export class PredictMonitor {
  private cache = new Map<string, EventSnapshot>();
  /** Snapshots whose last write failed: kept in memory and retried. */
  private unsaved = new Set<string>();

  constructor(readonly dir: string, private log: (msg: string) => void = () => {}) {}

  private file(season: number, code: string): string {
    const d = join(this.dir, "live", String(season));
    mkdirSync(d, { recursive: true });
    return join(d, `${code}.json`);
  }

  snapshot(season: number, code: string): EventSnapshot {
    const k = `${season}:${code}`;
    let s = this.cache.get(k);
    if (!s) {
      try { s = JSON.parse(readFileSync(this.file(season, code), "utf8")) as EventSnapshot; }
      catch { s = { season, code, matches: {}, advancement: {} }; }
      s.matches ??= {};
      s.advancement ??= {};
      this.cache.set(k, s);
      if (this.cache.size > 400) {
        // Never evict a snapshot that hasn't reached disk yet.
        const victim = [...this.cache.keys()].find((x) => !this.unsaved.has(x) && x !== k);
        if (victim) this.cache.delete(victim);
      }
    }
    return s;
  }

  /**
   * Record what a fresh forecast says, first-write-wins: unplayed matches'
   * win odds, and this stage's advancement odds if the stage has none yet.
   *
   * `storedPlayed` is the set of match keys the ratings already include
   * (the stored results); those are never recorded even if a stale event
   * payload still lists them as unplayed. A forecast of a finished event
   * (playoffs played, nothing left) records nothing, and advancement odds aren't
   * recorded once playoffs have started — both would use known answers.
   * Returns true when something new reached disk.
   */
  record(fc: Forecast, now = new Date(), storedPlayed: Set<string> = new Set()): boolean {
    const k = `${fc.season}:${fc.event}`;
    const snap = this.snapshot(fc.season, fc.event);
    const at = now.toISOString();
    let changed = false;
    // Finished = playoffs have been played and nothing is left. Completed
    // quals alone (playoff schedule not out yet) is NOT finished: an
    // after-quals or after-selection call made then is still a real forecast.
    const playoffsStarted = fc.matches.some((m) => m.level === "playoff" && (m.played || storedPlayed.has(m.key)));
    const finished = playoffsStarted && fc.matches.every((m) => m.played || storedPlayed.has(m.key));
    for (const m of finished ? [] : fc.matches) {
      if (m.played || m.pRedWin == null || snap.matches[m.key] || storedPlayed.has(m.key)) continue;
      snap.matches[m.key] = { p: round(m.pRedWin), at };
      changed = true;
    }
    // A "live" forecast (quals under way) is neither a clean pre-event call
    // nor a post-quals one, so it isn't scored as a stage.
    const stage = fc.stage === "live" || finished || playoffsStarted ? null : fc.stage;
    if (stage && !snap.advancement[stage] && fc.teams.length) {
      const teams: Record<string, number> = {};
      for (const t of fc.teams) teams[t.team] = round(t.pAdvance);
      snap.advancement[stage] = { at, teams, excluded: fc.prequalified };
      changed = true;
    }
    if (!changed && !this.unsaved.has(k)) return false;
    try {
      this.write(fc.season, fc.event, snap);
      this.unsaved.delete(k);
      return true;
    } catch (e) {
      this.unsaved.add(k);
      this.log(`[predict] snapshot write failed for ${fc.event} (will retry): ${(e as Error).message}`);
      return false;
    }
  }

  /** Overridable for tests. */
  protected write(season: number, code: string, snap: EventSnapshot): void {
    writeFileSync(this.file(season, code), JSON.stringify(snap));
  }

  /** Retry snapshots whose write failed (called after each sync). */
  flush(): number {
    let n = 0;
    for (const k of [...this.unsaved]) {
      const snap = this.cache.get(k);
      if (!snap) { this.unsaved.delete(k); continue; }
      try { this.write(snap.season, snap.code, snap); this.unsaved.delete(k); n++; }
      catch { /* keep for the next try */ }
    }
    return n;
  }

  /** Pre-match odds recorded for a match, if any (for "Called it / Upset"). */
  preMatch(season: number, code: string, key: string): number | null {
    return this.snapshot(season, code).matches[key]?.p ?? null;
  }

  /** Attach `pre` (recorded pre-match red win odds) to the forecast's played matches. */
  annotate<T extends Forecast>(fc: T): T {
    const snap = this.snapshot(fc.season, fc.event);
    return { ...fc, matches: fc.matches.map((m) => (m.played ? { ...m, pre: snap.matches[m.key]?.p ?? null } : m)) };
  }

  /** Every snapshot file of a season. */
  private all(season: number): EventSnapshot[] {
    let files: string[] = [];
    try { files = readdirSync(join(this.dir, "live", String(season))).filter((f) => f.endsWith(".json")); } catch { return []; }
    return files.map((f) => this.snapshot(season, f.slice(0, -5)));
  }

  /** Score a season's snapshots against played results and published advancement. */
  score(
    season: number,
    events: EventRecord[],
    advancement: { code: string; advancement: FirstAdvancement | null }[],
    now = new Date(),
  ): LiveAccuracy {
    const snaps = this.all(season);
    const byCode = new Map(events.map((e) => [e.code, e]));
    const matchOutcomes: ProbOutcome[] = [];
    let upsets = 0;
    for (const s of snaps) {
      const ev = byCode.get(s.code);
      if (!ev) continue;
      for (const m of ev.matches) {
        const pre = s.matches[`${m.level}:${m.series}:${m.number}`];
        if (!pre) continue;
        const y = m.red.total === m.blue.total ? 0.5 : m.red.total > m.blue.total ? 1 : 0;
        matchOutcomes.push({ p: pre.p, y });
        if (y !== 0.5 && pre.p !== 0.5 && (pre.p > 0.5) !== (y === 1)) upsets++;
      }
    }
    const advByCode = new Map(advancement.filter((a) => a.advancement).map((a) => [a.code, a.advancement!]));
    const stages: SnapStage[] = ["pre", "quals", "selected"];
    const adv = {} as Record<SnapStage, StageScore>;
    for (const st of stages) {
      const outcomes: ProbOutcome[] = [];
      let evs = 0;
      for (const s of snaps) {
        const a = advByCode.get(s.code);
        const shot = s.advancement[st];
        if (!a || !shot) continue;
        const status = new Map(a.rows.map((r) => [r.team, r.status]));
        const skip = new Set([...shot.excluded, ...a.rows.filter((r) => r.status === "ALREADY_ADVANCING" || r.status === "INELIGIBLE").map((r) => r.team)]);
        let used = 0;
        for (const [team, p] of Object.entries(shot.teams)) {
          const t = Number(team);
          if (skip.has(t)) continue;
          outcomes.push({ p, y: status.get(t) === "FIRST" ? 1 : 0 });
          used++;
        }
        if (used) evs++;
      }
      adv[st] = { n: outcomes.length, events: evs, brier: round(brier(outcomes)) };
    }
    return {
      season,
      matches: { n: matchOutcomes.length, accuracy: round(accuracyOf(matchOutcomes)), brier: round(brier(matchOutcomes)), upsets },
      advancement: adv,
      updatedAt: now.toISOString(),
    };
  }

  /** Log when live results are clearly worse than the back-test. Returns the warnings. */
  checkDrift(live: LiveAccuracy, base: DriftBaseline): string[] {
    const out: string[] = [];
    if (live.matches.n >= MIN_MATCHES && live.matches.brier > base.matchBrier + MATCH_TOLERANCE) {
      out.push(`match win odds: live Brier ${live.matches.brier.toFixed(3)} over ${live.matches.n} matches vs back-test ${base.matchBrier.toFixed(3)}`);
    }
    for (const st of ["pre", "quals", "selected"] as SnapStage[]) {
      const b = base.advancement[st];
      const l = live.advancement[st];
      if (b != null && l.n >= MIN_TEAMS && l.brier > b + ADV_TOLERANCE) {
        out.push(`advancement (${st}): live Brier ${l.brier.toFixed(3)} over ${l.n} teams vs back-test ${b.toFixed(3)}`);
      }
    }
    for (const w of out) this.log(`[predict] DRIFT ${live.season}: ${w}`);
    return out;
  }
}

const round = (x: number) => Math.round(x * 10000) / 10000;
