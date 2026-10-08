// Predict — the live engine behind /api/predict/*.
//
// Holds one rating book per season (replayed from the PredictStore), the
// award history and FIRST advancement records, and answers (see Forecaster):
//   forecast(event)   every team's odds of advancing, rank range, captain /
//                     picked / win chances (+ the asking team's breakdown)
//   partners(event)   "if we pick X" (likely captain) or "if X picks us"
//   match(red, blue)  win probability + expected scores
// Live event data (schedule, played results, ranks, alliances) comes from the
// same FtcEventFull payload Team Stats uses (FIRST Events primary).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RatingBook } from "./rating.js";
import { indexAwards, MODELLED_AWARDS, type AwardRecord } from "./awards.js";
import type { PredictStore } from "./store.js";
import type { EventRecord } from "./types.js";
import { Forecaster, normType, type AdvancementRecord, type PredictModel } from "./forecast.js";
import type { OfflinePredict } from "../../src/types/offlinePack.js";

export * from "./forecast.js";

// Fitted model (scripts/predict/export-model.mts), read at runtime.
// Path relative to the server's working directory (the repo / app root).
const M = JSON.parse(readFileSync(join(process.cwd(), "server", "predict", "model.json"), "utf8")) as PredictModel;

const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

export class PredictEngine extends Forecaster {
  protected readonly model = M;
  private books = new Map<number, RatingBook>();
  private events = new Map<number, EventRecord[]>();
  protected awardHistory = new Map<number, AwardRecord[]>();
  private advancement = new Map<number, AdvancementRecord[]>();
  /** Event code → FTC region code (from FTC Scout's event list), and all known regions. */
  private regionByCode = new Map<string, string>();
  private regions = new Set<string>();
  /** Parsed events by season and code, re-parsed only when the file changes. */
  private parsed = new Map<number, Map<string, { mtimeMs: number; rec: EventRecord | null }>>();
  readyAt: string | null = null;

  constructor(private store: PredictStore, readonly seasons: number[]) { super(); }

  get ready(): boolean { return this.readyAt != null; }
  protected hasRatings(): boolean { return this.books.size > 0; }
  protected advancementRecords(season: number): AdvancementRecord[] { return this.advancement.get(season) ?? []; }
  get accuracy(): unknown { return M.accuracy; }

  /** Match keys (`level:series:number`) of an event already in the ratings. */
  storedPlayedKeys(season: number, code: string): Set<string> {
    const ev = this.events.get(season)?.find((e) => e.code === code);
    return new Set((ev?.matches ?? []).map((m) => `${m.level}:${m.series}:${m.number}`));
  }

  /** Stored results of a season (for live accuracy scoring). */
  seasonData(season: number): { events: EventRecord[]; advancement: AdvancementRecord[] } {
    return { events: this.events.get(season) ?? [], advancement: this.advancement.get(season) ?? [] };
  }

  /**
   * Rebuild ratings + indexes from the store (seasons in order, oldest first).
   * Files are parsed in small batches, yielding between them so the server
   * stays responsive; unchanged files are reused from the last rebuild.
   */
  async rebuild(): Promise<void> {
    const book = new RatingBook(M.rating);
    const records: AwardRecord[] = [];
    for (const s of [...this.seasons].sort((a, b) => a - b)) {
      if (!this.store.hasSeason(s)) continue;
      for (const meta of Object.values(this.store.index(s))) if (meta.region) { this.regionByCode.set(meta.code, meta.region); this.regions.add(meta.region); }
      const cache = this.parsed.get(s) ?? new Map();
      const files = this.store.eventFiles(s);
      const seen = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        seen.add(f.code);
        const hit = cache.get(f.code);
        if (!hit || hit.mtimeMs !== f.mtimeMs) cache.set(f.code, { mtimeMs: f.mtimeMs, rec: this.store.parseEventFile(f.path, s) });
        if (i % 25 === 24) await yieldLoop();
      }
      for (const code of [...cache.keys()]) if (!seen.has(code)) cache.delete(code);
      this.parsed.set(s, cache);
      const evs = [...cache.values()].map((x) => x.rec).filter((x): x is EventRecord => !!x).sort((a, b) => a.startTime - b.startTime || a.code.localeCompare(b.code));
      this.events.set(s, evs);
      this.advancement.set(s, this.store.loadAdvancement(s));
      for (const e of evs) for (const a of e.awards) records.push({ season: s, team: a.team, time: e.startTime, type: a.type, placement: a.placement });
      book.startSeason(s);
      for (const m of evs.flatMap((e) => e.matches).sort((x, y) => x.time - y.time)) book.update(m);
      this.books.set(s, book.clone());
      await yieldLoop();
    }
    this.awardHistory = indexAwards(records);
    // Ready only once there are real ratings (a fresh install has no data yet).
    if (this.books.size && [...this.events.values()].some((evs) => evs.length)) this.readyAt = new Date().toISOString();
  }

  /** Ratings book for a season, with the clock set to now. */
  protected book(season: number): RatingBook | null {
    const b = this.books.get(season) ?? (season > Math.max(0, ...this.books.keys()) ? this.nextSeasonBook(season) : null);
    if (!b) return null;
    b.setTime(Date.now());
    return b;
  }

  /** A season with no matches yet: priors carried over from the latest season. */
  private nextSeasonBook(season: number): RatingBook | null {
    const latest = this.books.get(Math.max(...this.books.keys()));
    if (!latest) return null;
    const b = latest.clone();
    b.startSeason(season);
    this.books.set(season, b);
    return b;
  }

  /**
   * An event's region: from FTC Scout's event list when we have it, otherwise
   * the longest known region code that prefixes the event code (FTC event
   * codes start with their region, e.g. USNJNOLT2 → USNJ).
   */
  protected regionOf(code: string): string | null {
    const known = this.regionByCode.get(code);
    if (known) return known;
    let best: string | null = null;
    for (const r of this.regions) if (code.startsWith(r) && (!best || r.length > best.length)) best = r;
    return best;
  }

  /** Typical award line-up for an event type (awards given at ≥ half of such events). */
  protected awardSlots(season: number, type: string | null): { type: string; placement: number }[] {
    for (const s of [season, season - 1]) {
      const evs = (this.events.get(s) ?? []).filter((e) => normType(e.type) === normType(type) && e.awards.length);
      if (evs.length < 5) continue;
      const count = new Map<string, number>();
      for (const e of evs) for (const k of new Set(e.awards.filter((a) => MODELLED_AWARDS.has(a.type)).map((a) => `${a.type}:${a.placement}`))) count.set(k, (count.get(k) ?? 0) + 1);
      return [...count.entries()].filter(([, c]) => c >= evs.length / 2).map(([k]) => { const [t, p] = k.split(":"); return { type: t, placement: Number(p) }; });
    }
    return [{ type: "Inspire", placement: 1 }, { type: "Inspire", placement: 2 }];
  }

  /** Event codes of a season with their regions (for the offline pack). */
  eventRegions(season: number): Map<string, string> {
    const out = new Map<string, string>();
    for (const e of this.events.get(season) ?? []) { const r = this.regionOf(e.code); if (r) out.set(e.code, r); }
    return out;
  }

  /** Everything the browser needs to forecast these teams' events offline (V3.5 phase 6b). */
  offlineData(season: number, teams: Set<number>, types: (string | null)[]): OfflinePredict | null {
    const book = this.book(season);
    if (!book) return null;
    const lite = (recs: AdvancementRecord[]) => recs.map((r) => ({ ...r, advancement: r.advancement && { ...r.advancement, rows: r.advancement.rows.filter((x) => teams.has(x.team)) } }));
    const { accuracy: _accuracy, ...model } = M;
    return {
      model,
      book: book.toData(teams),
      advancement: { [season]: lite(this.advancementRecords(season)), [season - 1]: lite(this.advancementRecords(season - 1)) },
      awardSlots: Object.fromEntries([...new Set(types.map((t) => normType(t)))].map((t) => [t, this.awardSlots(season, t)])),
      awards: [...teams].filter((t) => this.awardHistory.has(t)).map((t) => [t, this.awardHistory.get(t)!] as [number, AwardRecord[]]),
    };
  }
}
