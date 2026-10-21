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
import { RatingBook } from "./rating.js";
import { indexAwards, MODELLED_AWARDS, type AwardRecord } from "./awards.js";
import type { PredictStore } from "./store.js";
import type { EventRecord, MatchRecord } from "./types.js";
import { Forecaster, normType, type AdvancementRecord, type PredictModel } from "./forecast.js";
import type { OfflinePredict } from "../../src/types/offlinePack.js";
import { FITTED_MODEL, PartnershipBook, PartnershipTable, bonusSamples, seasonBonusModel, type BonusFlags, type BonusModelSource, type PartnershipData } from "@control-scout/predict-engine";

export * from "./forecast.js";

// Fitted model: ships inside the shared engine package (one model for both
// apps). Refit with scripts/predict/* and release a new engine version.
const M: PredictModel = FITTED_MODEL;

const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

/** A pair table cut down to pairs whose both teams are in `teams` (events keep only those still referenced). */
function packPairs(d: PartnershipData, teams: Set<number>): PartnershipData {
  const together = d.together.filter((r) => teams.has(r[0]) && teams.has(r[1]));
  const used = [...new Set(together.map((r) => r[11]))].sort((a, b) => a - b);
  const index = new Map(used.map((old, i) => [old, i]));
  return {
    ...d,
    together: together.map((r) => [...r.slice(0, 11), index.get(r[11])!]),
    against: d.against.filter((r) => teams.has(r[0]) && teams.has(r[1])),
    events: used.map((i) => d.events[i]),
  };
}

export class PredictEngine extends Forecaster {
  protected readonly model = M;
  private books = new Map<number, RatingBook>();
  private events = new Map<number, EventRecord[]>();
  /** Stored matches by `season|code|level:series:number` (recorded bonus RPs for live payloads). */
  private stored = new Map<string, MatchRecord>();
  protected awardHistory = new Map<number, AwardRecord[]>();
  private advancement = new Map<number, AdvancementRecord[]>();
  /** Event code → FTC region code (from FTC Scout's event list), and all known regions. */
  private regionByCode = new Map<string, string>();
  private regions = new Set<string>();
  /** Parsed events by season and code, re-parsed only when the file changes. */
  private parsed = new Map<number, Map<string, { mtimeMs: number; rec: EventRecord | null; name: string | null }>>();
  readyAt: string | null = null;
  /** Pair history (engine 2.2 partnership memory) through the newest season: earlier matches the
   *  robots played together or against each other, shown as a reason with a prediction. */
  private pairTable: PartnershipTable | null = null;
  /** The same table as data, for offline packs (filtered to a pack's teams). */
  private pairData: PartnershipData | null = null;

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
    // Built aside and swapped in together at the end: forecasts and offline
    // packs taken while this runs see the previous complete snapshot, never
    // new ratings with old award history or advancement.
    const books = new Map<number, RatingBook>();
    const events = new Map<number, EventRecord[]>();
    const advancement = new Map<number, AdvancementRecord[]>();
    const pairs = new PartnershipBook(M.rating);
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
        if (!hit || hit.mtimeMs !== f.mtimeMs) {
          // Event names word the partnership facts ("best 131 at Arkansas Championship").
          const parsed = this.store.parseEventFileNamed ? this.store.parseEventFileNamed(f.path, s) : { rec: this.store.parseEventFile(f.path, s), name: null };
          cache.set(f.code, { mtimeMs: f.mtimeMs, ...parsed });
        }
        if (i % 25 === 24) await yieldLoop();
      }
      for (const code of [...cache.keys()]) if (!seen.has(code)) cache.delete(code);
      this.parsed.set(s, cache);
      const evs = [...cache.values()].map((x) => x.rec).filter((x): x is EventRecord => !!x).sort((a, b) => a.startTime - b.startTime || a.code.localeCompare(b.code));
      events.set(s, evs);
      advancement.set(s, this.store.loadAdvancement(s));
      for (const e of evs) for (const a of e.awards) records.push({ season: s, team: a.team, time: e.startTime, type: a.type, placement: a.placement });
      book.startSeason(s);
      for (const [code, x] of cache) if (x.name) pairs.nameEvent(s, code, x.name);
      for (const m of evs.flatMap((e) => e.matches).sort((x, y) => x.time - y.time)) { pairs.observe(m); book.update(m); }
      books.set(s, book.clone());
      await yieldLoop();
    }
    // Pairs of teams active in the newest two seasons only (the ones a call can be about).
    const newest = Math.max(...this.seasons);
    const active = new Set([...(books.get(newest)?.ratings.keys() ?? []), ...(books.get(newest - 1)?.ratings.keys() ?? [])]);
    // Weak pairs (under the shown counts) stay: an event's fresh results fold into this table (PartnershipOverlay), on
    // the server and in offline packs, and must count a pair's one earlier match.
    const pairData: PartnershipData | null = pairs.season != null ? { ...pairs.toData({ teams: active, keepWeak: true }), season: newest } : null;
    const pairTable = PartnershipTable.fromData(pairData);
    // One synchronous swap (no await in between).
    this.pairTable = pairTable;
    this.pairData = pairData;
    this.books = books;
    this.events = events;
    this.stored = new Map([...events.values()].flat().flatMap((e) => e.matches.map((m) => [`${m.season}|${m.eventCode}|${m.level}:${m.series}:${m.number}`, m] as [string, MatchRecord])));
    this.advancement = advancement;
    this.awardHistory = indexAwards(records);
    this.bonusModels = new Map();
    // Ready only once there are real ratings (a fresh install has no data yet).
    if (books.size && [...events.values()].some((evs) => evs.length)) this.readyAt = new Date().toISOString();
  }

  /**
   * Recorded bonus RPs of a stored match. The live FtcEventFull payload doesn't
   * carry them, so a live forecast keeps the official flags from the synced
   * FTC Scout record instead of guessing them from the score.
   */
  protected recordedBonus(season: number, code: string, key: string, side: "red" | "blue"): BonusFlags | null {
    return this.stored.get(`${season}|${code}|${key}`)?.[side].bonusRp ?? null;
  }

  private bonusModels = new Map<number, BonusModelSource | null>();
  /**
   * The season's bonus-RP model, exactly as Control Scout serves it: fitted to
   * the season's latest stored qualification results (engine seasonBonusModel),
   * else the shipped fit. Once per rebuild.
   */
  bonusModel(season: number): BonusModelSource | null {
    if (!this.bonusModels.has(season)) {
      const matches = () => (this.events.get(season) ?? []).flatMap((e) => e.matches).sort((x, y) => x.time - y.time);
      this.bonusModels.set(season, seasonBonusModel(M.bonus, season, () => bonusSamples(matches())));
    }
    return this.bonusModels.get(season)!;
  }

  /** Recorded bonus RPs of an event's stored matches, by match key ([red, blue]). */
  private storedBonus(season: number, code: string): Record<string, [BonusFlags | null, BonusFlags | null]> {
    const out: Record<string, [BonusFlags | null, BonusFlags | null]> = {};
    for (const m of this.events.get(season)?.find((e) => e.code === code)?.matches ?? []) {
      if (m.red.bonusRp || m.blue.bonusRp) out[`${m.level}:${m.series}:${m.number}`] = [m.red.bonusRp ?? null, m.blue.bonusRp ?? null];
    }
    return out;
  }

  /** Pair history, only for the season it was built through (an older season's call mustn't read later pairs). */
  protected partnerships(season: number): PartnershipTable | null {
    return this.pairTable && this.pairTable.season === season ? this.pairTable : null;
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
  offlineData(season: number, teams: Set<number>, types: (string | null)[], codes: string[]): OfflinePredict | null {
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
      // The results the ratings actually include: the pack's files may be newer
      // (a sync between writing them and the rebuild), and the device folds
      // those in itself.
      played: Object.fromEntries(codes.map((c) => [c, [...this.storedPlayedKeys(season, c)]])),
      // Their recorded bonus RPs: the device's live forecast keeps them as facts, like the server's.
      bonus: Object.fromEntries(codes.map((c) => [c, this.storedBonus(season, c)])),
      // The bonus-RP model the server's forecasts use, so the device's bonus odds are the same.
      bonusModel: this.bonusModel(season),
      // Pair history between the pack's teams, so offline calls carry the same reasons (engine 2.4).
      ...(this.pairData && this.pairData.season === season ? { partnerships: packPairs(this.pairData, teams) } : {}),
    };
  }
}
