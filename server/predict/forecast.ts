// Predict — forecasting an event from ratings: stage, advancement slots, award
// odds and the Monte Carlo simulation. Pure (no Node APIs): the server's
// PredictEngine and the browser's offline forecast (V3.5 phase 6b) both
// extend Forecaster and supply the data — ratings, stored results,
// advancement records and award history.
import { npOf, type RatingBook, type RatingParams } from "./rating.js";
import { predictMatch, type NoiseParams } from "./matchModel.js";
import type { CalibrationParams } from "./calibration.js";
import { rng, simulateEvent, type AwardInput, type BonusModel, type PickModel, type QualMatch, type SimInput, type TeamOutcome } from "./sim.js";
import { awardFeatures, sampleAwards, type AwardModel, type AwardRecord } from "./awards.js";
import { ADVANCING_TYPES } from "./scoutData.js";
import type { AllianceResult, MatchRecord } from "./types.js";
import type { FtcEventFull } from "../../src/types/ftcScout.js";
import type { FirstAdvancement } from "../ftcEvents.js";

/** The fitted model (server/predict/model.json, from scripts/predict/export-model.mts). */
export interface PredictModel {
  rating: RatingParams; noise: Required<NoiseParams>; pick: PickModel;
  bonus: Record<string, BonusModel>; awards: AwardModel; accuracy?: unknown;
  calibration?: CalibrationParams;
}

/** FIRST advancement for a finished event (null = not published). */
export interface AdvancementRecord { code: string; type: string; region: string | null; end: string; advancement: FirstAdvancement | null }

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
  /** Every scheduled/played match at the event with its prediction (from current ratings). */
  matches: ForecastMatch[];
  generatedAt: string;
}

export interface ForecastMatch {
  key: string;
  label: string;
  level: "qual" | "playoff";
  red: number[];
  blue: number[];
  /** Prediction from current ratings; null for played matches (current ratings
   *  already include the result, so it wouldn't be a real prediction) and for
   *  playoff alliances listing three robots (which two played is unknown). */
  pRedWin: number | null;
  redMean: number | null;
  blueMean: number | null;
  /** Real final scores once played. */
  played: { red: number; blue: number } | null;
  /** Played matches only: red's win odds as recorded *before* the match was
   *  played (live monitoring), or null if no forecast was made in time. */
  pre?: number | null;
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

// Browser-safe (the offline forecast runs on the device too).
const yieldLoop = () => new Promise<void>((r) => setTimeout(r, 0));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };


export abstract class Forecaster {
  protected abstract readonly model: PredictModel;
  /** Ratings for a season, clock set to now (null when there are none). */
  protected abstract book(season: number): RatingBook | null;
  protected abstract hasRatings(): boolean;
  /** Match keys (`level:series:number`) of an event already folded into the ratings. */
  abstract storedPlayedKeys(season: number, code: string): Set<string>;
  protected abstract advancementRecords(season: number): AdvancementRecord[];
  protected abstract regionOf(code: string): string | null;
  /** Typical award line-up for an event type. */
  protected abstract awardSlots(season: number, type: string | null): { type: string; placement: number }[];
  protected abstract readonly awardHistory: Map<number, AwardRecord[]>;

  match(season: number, red: number[], blue: number[]) {
    const book = this.book(season);
    if (!book) return null;
    return predictMatch(book, red, blue, this.model.noise, this.model.calibration);
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

  /** Slots + already-qualified teams: official when published, otherwise inferred. */
  private advancementFor(ev: FtcEventFull, startTime: number) {
    const all = this.advancementRecords(ev.season);
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
    const sameType = [...all, ...this.advancementRecords(ev.season - 1)].filter((a) => a.advancement && normType(a.type) === normType(ev.type));
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

  /**
   * Ratings for an event right now: the season book plus this event's played
   * matches that the last background sync hasn't folded in yet.
   */
  private eventBook(ev: FtcEventFull, book: RatingBook): RatingBook {
    const have = this.storedPlayedKeys(ev.season, ev.code);
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

  private simInput(ev: FtcEventFull, stage: Stage, book: RatingBook, runs: number): { input: SimInput; assumptions: string[]; adv: ReturnType<Forecaster["advancementFor"]> } {
    const assumptions: string[] = [];
    const startTime = ev.start ? Date.parse(`${ev.start}T00:00:00Z`) : Date.now();
    const teams = ev.field.map((t) => t.teamNumber);
    const ahead = stage === "pre" || stage === "live";
    const ratings = new Map(teams.map((t) => {
      const r = book.get(t);
      return [t, ahead ? { ...r, uncertainty: r.uncertainty + (this.model.noise.preExtra ?? 0) } : r];
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
    const bonus = this.model.bonus[String(ev.season)];
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
    const feats = new Map(teams.map((t, i) => [t, awardFeatures(this.awardHistory, t, ev.season, startTime, this.model.awards.decay, (vals[i] - mu) / sd)]));
    const slots = this.awardSlots(ev.season, ev.type);
    const awards: AwardInput = { mode: "sample", sample: (r) => sampleAwards(slots, teams, feats, this.model.awards, r) };
    const ranks = stage === "quals" || stage === "selected" ? new Map(ev.field.filter((t) => t.rank != null).map((t) => [t.teamNumber, t.rank!])) : undefined;
    const alliances = stage === "selected" ? ev.alliances.filter((a) => a.captain).sort((a, b) => a.number - b.number).map((a) => [a.captain!, ...a.picks]) : undefined;
    const playoffPlayed = stage === "selected" ? this.playoffResults(ev) : undefined;
    if (playoffPlayed) assumptions.push("Playoff matches already played keep their real results.");
    const input: SimInput = {
      season: ev.season, ratings, quals, noise: this.model.noise, bonus, pick: this.model.pick, ranks, alliances, awards, playoffPlayed,
      prequalified: new Set(adv.prequalified), ineligible: new Set(adv.ineligible), slots: adv.slots, runs, seed: 1,
    };
    return { input, assumptions, adv };
  }

  // -------------------------------------------------------------------------
  // Public queries
  // -------------------------------------------------------------------------

  /** Why an event can't be forecast, or null when it can. */
  unsupportedReason(ev: FtcEventFull): string | null {
    if (!this.hasRatings()) return "Predictions are still loading.";
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
    const matches: ForecastMatch[] = ev.matches.filter((m) => m.red.teams.length && m.blue.teams.length).slice(0, 400).map((m) => {
      const red = m.red.teams.map((t) => t.number), blue = m.blue.teams.map((t) => t.number);
      const p = !m.played && red.length <= 2 && blue.length <= 2 ? predictMatch(book, red, blue, this.model.noise, this.model.calibration) : null;
      return {
        key: m.key, label: m.label, level: m.level, red, blue, pRedWin: p?.pRedWin ?? null, redMean: p?.red.mean ?? null, blueMean: p?.blue.mean ?? null,
        played: m.played && m.red.score?.total != null && m.blue.score?.total != null ? { red: m.red.score.total, blue: m.blue.score.total } : null,
      };
    });
    teams.sort((a, b) => b.pAdvance - a.pAdvance || a.rank.mean - b.rank.mean);
    return {
      season: ev.season, event: ev.code, stage, runs, slots: adv.slots, slotsSource: adv.source,
      prequalified: adv.prequalified.filter((t) => res.has(t)), assumptions, teams, matchesOnly, matches,
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
