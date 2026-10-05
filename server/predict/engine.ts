// Predict — the live engine behind /api/predict/*.
//
// Holds one rating book per season (replayed from the PredictStore), the
// award history and FIRST advancement records, and answers:
//   forecast(event)   every team's odds of advancing, rank range, captain /
//                     picked / win chances (+ the asking team's breakdown)
//   partners(event)   "if we pick X" (likely captain) or "if X picks us"
//   match(red, blue)  win probability + expected scores
// Live event data (schedule, played results, ranks, alliances) comes from the
// same FtcEventFull payload Team Stats uses (FIRST Events primary).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RatingBook, npOf, type RatingParams } from "./rating.js";
import { predictMatch, type NoiseParams } from "./matchModel.js";
import { rng, simulateEvent, type AwardInput, type BonusModel, type PickModel, type QualMatch, type SimInput, type TeamOutcome } from "./sim.js";
import { awardFeatures, indexAwards, sampleAwards, MODELLED_AWARDS, type AwardModel, type AwardRecord } from "./awards.js";
import { ADVANCING_TYPES } from "./scoutData.js";
import type { PredictStore } from "./store.js";
import type { AllianceResult, EventRecord, MatchRecord } from "./types.js";
import type { FtcEventFull } from "../../src/types/ftcScout.js";

// Fitted model (scripts/predict/export-model.mts), read at runtime.
// Path relative to the server's working directory (the repo / app root).
const M = JSON.parse(readFileSync(join(process.cwd(), "server", "predict", "model.json"), "utf8")) as {
  rating: RatingParams; noise: Required<NoiseParams>; pick: PickModel;
  bonus: Record<string, BonusModel>; awards: AwardModel; accuracy: unknown;
};

export type Stage = "pre" | "live" | "quals" | "selected";

export interface ForecastTeam {
  team: number;
  pAdvance: number;
  pCaptain: number;
  pPicked: number;
  pWin: number;
  pFinalist: number;
  rank: { mean: number; p10: number; p90: number };
  /**
   * Expected advancement points. `matchPoints` (quals + alliance + playoffs)
   * is shown for everyone; award points and the award-inclusive total only
   * for the asking team.
   */
  points: { quals: number; alliance: number; playoffs: number; matchPoints: number; awards: number | null; total: number | null };
  /** Rating: expected non-penalty contribution and how sure we are (± points, 1 sd). */
  strength: { np: number; auto: number; teleop: number; endgame: number; sd: number; matches: number };
}

export interface Forecast {
  season: number;
  event: string;
  stage: Stage;
  runs: number;
  slots: number;
  slotsSource: "official" | "estimated" | "estimated-broad" | "default";
  prequalified: number[];
  assumptions: string[];
  teams: ForecastTeam[];
  /** The asking team's odds with match results only (no award points), for comparison. */
  matchesOnly: { team: number; pAdvance: number } | null;
  generatedAt: string;
}

export interface PartnerOption { team: number; pAdvance: number; pWin: number }
export interface Partners {
  role: "captain" | "picked" | "none";
  myTeam: number;
  baseline: { pAdvance: number; pWin: number; pCaptain: number };
  options: PartnerOption[];
}

/** FIRST names types with spaces ("League Tournament"); FTC Scout doesn't. */
export const normType = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, "");

const yieldLoop = () => new Promise<void>((r) => setImmediate(r));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

export class PredictEngine {
  private books = new Map<number, RatingBook>();
  private events = new Map<number, EventRecord[]>();
  private awardsByTeam = new Map<number, AwardRecord[]>();
  private advancement = new Map<number, ReturnType<PredictStore["loadAdvancement"]>>();
  /** Event code → FTC region code (from FTC Scout's event list), and all known regions. */
  private regionByCode = new Map<string, string>();
  private regions = new Set<string>();
  /** Parsed events by season and code, re-parsed only when the file changes. */
  private parsed = new Map<number, Map<string, { mtimeMs: number; rec: EventRecord | null }>>();
  readyAt: string | null = null;

  constructor(private store: PredictStore, readonly seasons: number[]) {}

  get ready(): boolean { return this.readyAt != null; }
  get accuracy(): unknown { return M.accuracy; }

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
    this.awardsByTeam = indexAwards(records);
    // Ready only once there are real ratings (a fresh install has no data yet).
    if (this.books.size && [...this.events.values()].some((evs) => evs.length)) this.readyAt = new Date().toISOString();
  }

  /** Ratings book for a season, with the clock set to now. */
  private book(season: number): RatingBook | null {
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

  match(season: number, red: number[], blue: number[]) {
    const book = this.book(season);
    if (!book) return null;
    return predictMatch(book, red, blue, M.noise);
  }

  // -------------------------------------------------------------------------
  // Event inputs
  // -------------------------------------------------------------------------

  private stageOf(ev: FtcEventFull): Stage {
    const quals = ev.matches.filter((m) => m.level === "qual");
    if (ev.alliances.some((a) => a.captain && a.picks.length)) return "selected";
    const ranked = ev.field.filter((t) => t.rank != null).length;
    if (quals.length && quals.every((m) => m.played) && ranked >= 2) return "quals";
    return quals.some((m) => m.played) ? "live" : "pre";
  }

  /**
   * An event's region: from FTC Scout's event list when we have it, otherwise
   * the longest known region code that prefixes the event code (FTC event
   * codes start with their region, e.g. USNJNOLT2 → USNJ).
   */
  private regionOf(code: string): string | null {
    const known = this.regionByCode.get(code);
    if (known) return known;
    let best: string | null = null;
    for (const r of this.regions) if (code.startsWith(r) && (!best || r.length > best.length)) best = r;
    return best;
  }

  /** Slots + already-qualified teams: official when published, otherwise inferred. */
  private advancementFor(ev: FtcEventFull, startTime: number) {
    const all = this.advancement.get(ev.season) ?? [];
    const own = all.find((a) => a.code === ev.code)?.advancement;
    if (own) {
      return {
        slots: own.slots, source: "official" as const, region: null as string | null,
        prequalified: own.rows.filter((r) => r.status === "ALREADY_ADVANCING").map((r) => r.team),
        ineligible: own.rows.filter((r) => r.status === "INELIGIBLE").map((r) => r.team),
      };
    }
    // Infer from same-region events of the same type: their usual destination
    // and slot count. If the region is unknown or has none, fall back to every
    // region for the slot count only (and say so) — never borrow another
    // region's destination for already-qualified teams.
    const region = this.regionOf(ev.code);
    const sameType = [...all, ...(this.advancement.get(ev.season - 1) ?? [])].filter((a) => a.advancement && normType(a.type) === normType(ev.type));
    const regional = region ? sameType.filter((a) => a.region === region) : [];
    const peers = regional.length ? regional : [];
    const dest = new Map<string, number>();
    for (const p of peers) if (p.advancement?.advancesTo) dest.set(p.advancement.advancesTo, (dest.get(p.advancement.advancesTo) ?? 0) + 1);
    const advancesTo = [...dest.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const slotSamples = peers.map((p) => p.advancement!.slots);
    const already = new Set<number>();
    if (advancesTo) for (const a of all) {
      if (a.advancement?.advancesTo !== advancesTo || Date.parse(`${a.end}T23:59:59Z`) >= startTime) continue;
      for (const r of a.advancement.rows) if (r.status === "FIRST") already.add(r.team);
    }
    if (slotSamples.length) return { slots: median(slotSamples), source: "estimated" as const, prequalified: [...already], ineligible: [], region };
    if (sameType.length) return { slots: median(sameType.map((p) => p.advancement!.slots)), source: "estimated-broad" as const, prequalified: [], ineligible: [], region };
    return { slots: ev.field.length > 20 ? 6 : 4, source: "default" as const, prequalified: [], ineligible: [], region };
  }

  /** Typical award line-up for an event type (awards given at ≥ half of such events). */
  private awardSlots(season: number, type: string | null): { type: string; placement: number }[] {
    for (const s of [season, season - 1]) {
      const evs = (this.events.get(s) ?? []).filter((e) => normType(e.type) === normType(type) && e.awards.length);
      if (evs.length < 5) continue;
      const count = new Map<string, number>();
      for (const e of evs) for (const k of new Set(e.awards.filter((a) => MODELLED_AWARDS.has(a.type)).map((a) => `${a.type}:${a.placement}`))) count.set(k, (count.get(k) ?? 0) + 1);
      return [...count.entries()].filter(([, c]) => c >= evs.length / 2).map(([k]) => { const [t, p] = k.split(":"); return { type: t, placement: Number(p) }; });
    }
    return [{ type: "Inspire", placement: 1 }, { type: "Inspire", placement: 2 }];
  }

  /**
   * Ratings for an event right now: the season book plus this event's played
   * matches that the last background sync hasn't folded in yet.
   */
  private eventBook(ev: FtcEventFull, book: RatingBook): RatingBook {
    const stored = this.events.get(ev.season)?.find((e) => e.code === ev.code);
    const have = new Set((stored?.matches ?? []).map((m) => `${m.level}:${m.series}:${m.number}`));
    const fresh: MatchRecord[] = [];
    const base = Date.parse(`${ev.start ?? "1970-01-01"}T00:00:00Z`);
    for (const m of ev.matches) {
      if (!m.played || have.has(m.key)) continue;
      const side = (a: FtcEventFull["matches"][number]["red"]): AllianceResult | null => {
        const sc = a.score;
        if (!sc || sc.total == null) return null;
        const np = sc.totalNp ?? sc.total;
        const auto = sc.auto ?? 0, endgame = sc.endgame ?? 0;
        return { teams: a.teams.map((t) => t.number), auto, endgame, teleop: sc.teleop ?? Math.max(0, np - auto - endgame), np, penCommitted: sc.penaltiesCommitted ?? 0, total: sc.total };
      };
      const red = side(m.red), blue = side(m.blue);
      if (!red || !blue) continue;
      // Only 2 robots per alliance play. The live payload doesn't say which
      // robots of a 3-team playoff alliance sat out, so skip those matches
      // rather than crediting a robot that didn't play (the next background
      // sync, which knows who was on the field, includes them).
      if (red.teams.length > 2 || blue.teams.length > 2) continue;
      const order = (m.level === "playoff" ? 1e6 : 0) + (m.series ?? 0) * 1e3 + m.number;
      fresh.push({ season: ev.season, eventCode: ev.code, level: m.level, series: m.series ?? 0, number: m.number, time: Date.parse(m.time ?? "") || base + order, red, blue });
    }
    if (!fresh.length) return book;
    const b = book.clone();
    for (const m of fresh.sort((x, y) => x.time - y.time)) b.update(m);
    b.setTime(Date.now());
    return b;
  }

  /** Played playoff matches → winning alliance number, keyed by bracket match (or final game) number. */
  private playoffResults(ev: FtcEventFull): Map<number, number> | undefined {
    const allianceOf = new Map<number, number>();
    for (const a of ev.alliances) for (const t of [a.captain, ...a.picks]) if (t) allianceOf.set(t, a.number);
    const out = new Map<number, number>();
    const twoAlliance = ev.alliances.length === 2;
    for (const m of ev.matches) {
      if (m.level !== "playoff" || !m.played || m.red.score?.total == null || m.blue.score?.total == null || m.red.score.total === m.blue.score.total) continue;
      const winner = m.red.score.total > m.blue.score.total ? m.red : m.blue;
      const k = allianceOf.get(winner.teams[0]?.number ?? -1);
      if (k == null) continue;
      out.set(twoAlliance ? m.number : (m.series ?? m.number), k);
    }
    return out.size ? out : undefined;
  }

  private simInput(ev: FtcEventFull, stage: Stage, book: RatingBook, runs: number): { input: SimInput; assumptions: string[]; adv: ReturnType<PredictEngine["advancementFor"]> } {
    const assumptions: string[] = [];
    const startTime = ev.start ? Date.parse(`${ev.start}T00:00:00Z`) : Date.now();
    const teams = ev.field.map((t) => t.teamNumber);
    const ahead = stage === "pre" || stage === "live";
    const ratings = new Map(teams.map((t) => {
      const r = book.get(t);
      return [t, ahead ? { ...r, uncertainty: r.uncertainty + (M.noise.preExtra ?? 0) } : r];
    }));
    const quals: QualMatch[] = ev.matches.filter((m) => m.level === "qual").map((m) => {
      const q: QualMatch = {
        red: m.red.teams.map((t) => t.number), blue: m.blue.teams.map((t) => t.number),
        noRank: [...m.red.teams, ...m.blue.teams].filter((t) => t.surrogate).map((t) => t.number),
      };
      const rs = m.red.score, bs = m.blue.score;
      if (m.played && rs?.total != null && bs?.total != null) {
        q.result = {
          red: { total: rs.total, np: rs.totalNp ?? rs.total, auto: rs.auto ?? 0, endgame: rs.endgame ?? 0 },
          blue: { total: bs.total, np: bs.totalNp ?? bs.total, auto: bs.auto ?? 0, endgame: bs.endgame ?? 0 },
        };
      }
      return q;
    });
    if (!quals.length) {
      assumptions.push("The qualification schedule isn't published yet, so a random schedule is used.");
      // Six rounds of random 2v2 matches as a stand-in schedule.
      const rounds = 6;
      const rand = rng(ev.code.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
      for (let r = 0; r < rounds; r++) {
        const order = teams.map((t) => ({ t, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.t);
        for (let i = 0; i + 3 < order.length; i += 4) quals.push({ red: [order[i], order[i + 1]], blue: [order[i + 2], order[i + 3]] });
      }
    }
    const bonus = M.bonus[String(ev.season)];
    if (stage === "live" && bonus) assumptions.push("Bonus ranking points of matches already played are estimated from their scores.");
    if (stage === "live" && bonus) for (const q of quals) if (q.result) {
      // Played matches: bonus RPs aren't in the merged payload; use expected values from the score.
      const lg = (c: [number, number], np: number) => 1 / (1 + Math.exp(-(c[0] + c[1] * np)));
      for (const side of [q.result.red, q.result.blue]) side.bonus = { movement: lg(bonus.movement, side.np) > 0.5, goal: lg(bonus.goal, side.np) > 0.5, pattern: lg(bonus.pattern, side.np) > 0.5 };
    }
    const adv = this.advancementFor(ev, startTime);
    if (adv.source === "estimated") assumptions.push(`Advancement slots (${adv.slots}) and already-qualified teams are estimated from earlier ${ev.type ?? ""} events in ${adv.region}.`);
    else if (adv.source === "estimated-broad") assumptions.push(`Advancement slots (${adv.slots}) are estimated from ${ev.type ?? "similar"} events in all regions (none found for this region yet); already-qualified teams aren't known, so none are assumed.`);
    else if (adv.source === "default") assumptions.push(`Advancement slots (${adv.slots}) are a default guess — no similar events found; already-qualified teams aren't known.`);
    // Awards: sampled from team history (the event's award winners aren't known in advance).
    const vals = teams.map((t) => npOf(ratings.get(t)!));
    const mu = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
    const feats = new Map(teams.map((t, i) => [t, awardFeatures(this.awardsByTeam, t, ev.season, startTime, M.awards.decay, (vals[i] - mu) / sd)]));
    const slots = this.awardSlots(ev.season, ev.type);
    const awards: AwardInput = { mode: "sample", sample: (r) => sampleAwards(slots, teams, feats, M.awards, r) };
    const ranks = stage === "quals" || stage === "selected" ? new Map(ev.field.filter((t) => t.rank != null).map((t) => [t.teamNumber, t.rank!])) : undefined;
    const alliances = stage === "selected" ? ev.alliances.filter((a) => a.captain).sort((a, b) => a.number - b.number).map((a) => [a.captain!, ...a.picks]) : undefined;
    const playoffPlayed = stage === "selected" ? this.playoffResults(ev) : undefined;
    if (playoffPlayed) assumptions.push("Playoff matches already played keep their real results.");
    const input: SimInput = {
      season: ev.season, ratings, quals, noise: M.noise, bonus, pick: M.pick, ranks, alliances, awards, playoffPlayed,
      prequalified: new Set(adv.prequalified), ineligible: new Set(adv.ineligible), slots: adv.slots, runs, seed: 1,
    };
    return { input, assumptions, adv };
  }

  // -------------------------------------------------------------------------
  // Public queries
  // -------------------------------------------------------------------------

  /** Why an event can't be forecast, or null when it can. */
  unsupportedReason(ev: FtcEventFull): string | null {
    if (!this.books.size) return "Predictions are still loading.";
    if (!ADVANCING_TYPES.has(normType(ev.type))) return "This event doesn't advance teams, so there are no advancement odds.";
    // A championship split into divisions plays its quals in the divisions;
    // the parent event only holds the finals.
    if (!ev.matches.some((m) => m.level === "qual") && (ev.alliances.length > 0 || ev.matches.some((m) => m.level === "playoff"))) {
      return "This championship is split into divisions — open your division's event to see its forecast.";
    }
    return null;
  }

  forecast(ev: FtcEventFull, myTeam: number | null, runs = 2000): Forecast | null {
    const seasonBook = this.book(ev.season);
    if (!seasonBook || this.unsupportedReason(ev)) return null;
    const book = this.eventBook(ev, seasonBook);
    const stage = this.stageOf(ev);
    const { input, assumptions, adv } = this.simInput(ev, stage, book, runs);
    if (normType(ev.type) === "Championship" && adv.source !== "official") {
      assumptions.push("Championship divisions are treated as their own event; the real slots are shared across divisions.");
    }
    const res = simulateEvent(input);
    let matchesOnly: Forecast["matchesOnly"] = null;
    if (myTeam && res.has(myTeam)) {
      const mo = simulateEvent({ ...input, awards: { mode: "none" }, runs: Math.min(runs, 1000) });
      matchesOnly = { team: myTeam, pAdvance: mo.get(myTeam)?.pAdvance ?? 0 };
    }
    const teams: ForecastTeam[] = [...res.values()].map((o) => this.teamView(o, book, o.team === myTeam));
    teams.sort((a, b) => b.pAdvance - a.pAdvance || a.rank.mean - b.rank.mean);
    return {
      season: ev.season, event: ev.code, stage, runs, slots: adv.slots, slotsSource: adv.source,
      prequalified: adv.prequalified.filter((t) => res.has(t)), assumptions, teams, matchesOnly,
      generatedAt: new Date().toISOString(),
    };
  }

  private teamView(o: TeamOutcome, book: RatingBook, mine: boolean): ForecastTeam {
    const r = book.get(o.team);
    const p = o.points;
    return {
      team: o.team, pAdvance: o.pAdvance, pCaptain: o.pCaptain, pPicked: o.pPicked, pWin: o.pWin, pFinalist: o.pFinalist,
      rank: { mean: o.meanRank, p10: o.rankP10, p90: o.rankP90 },
      points: { quals: p.quals, alliance: p.alliance, playoffs: p.playoffs, matchPoints: p.quals + p.alliance + p.playoffs, awards: mine ? p.awards : null, total: mine ? p.total : null },
      strength: { np: npOf(r), auto: r.auto, teleop: r.teleop, endgame: r.endgame, sd: Math.sqrt(r.uncertainty), matches: r.n },
    };
  }

  /**
   * "If we pick X" when we're a likely captain, otherwise "if captain X picks
   * us". Before alliance selection only; one forced-pair simulation per option.
   */
  async partners(ev: FtcEventFull, myTeam: number, runs = 600, maxOptions = 16): Promise<Partners | null> {
    const seasonBook = this.book(ev.season);
    if (!seasonBook || !ev.field.some((t) => t.teamNumber === myTeam)) return null;
    const book = this.eventBook(ev, seasonBook);
    const stage = this.stageOf(ev);
    if (stage === "selected") return { role: "none", myTeam, baseline: { pAdvance: 0, pWin: 0, pCaptain: 0 }, options: [] };
    const { input } = this.simInput(ev, stage, book, runs);
    const base = simulateEvent(input);
    const me = base.get(myTeam);
    if (!me) return null;
    const role: Partners["role"] = me.pCaptain >= 0.5 ? "captain" : "picked";
    const others = ev.field.map((t) => t.teamNumber).filter((t) => t !== myTeam);
    const pool = role === "captain"
      ? others.sort((a, b) => npOf(book.get(b)) - npOf(book.get(a))).slice(0, maxOptions)
      : others.filter((t) => (base.get(t)?.pCaptain ?? 0) >= 0.15).sort((a, b) => (base.get(b)!.pCaptain - base.get(a)!.pCaptain)).slice(0, maxOptions);
    const options: PartnerOption[] = [];
    for (const t of pool) {
      await yieldLoop(); // keep the server responsive between simulations
      const forced = simulateEvent({ ...input, forcePartner: role === "captain" ? { team: myTeam, partner: t } : { team: t, partner: myTeam } });
      const o = forced.get(myTeam);
      if (o) options.push({ team: t, pAdvance: o.pAdvance, pWin: o.pWin });
    }
    options.sort((a, b) => b.pAdvance - a.pAdvance || b.pWin - a.pWin);
    return { role, myTeam, baseline: { pAdvance: me.pAdvance, pWin: me.pWin, pCaptain: me.pCaptain }, options };
  }
}
