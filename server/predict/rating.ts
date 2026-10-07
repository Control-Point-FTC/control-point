// Predict — Layer 1: team ratings (EPA-style, per game component).
//
// Each team carries an expected contribution to its alliance for auto,
// TeleOp (without endgame), endgame and penalties committed. After every
// played match the alliance's error on each component is split equally
// between its robots and folded in with a gain that shrinks as the team
// plays more (fast early, stable later). Playoff matches count less: teams
// play differently in eliminations.
//
// New season: games change, so raw points don't carry over. A team's final
// rating is turned into a z-score within its season and carried forward
// with decay (ρ1 for last season, ρ2 for the one before), scaled into the
// new season's units using the population seen so far. Teams with no
// history (rookies) start from a fitted rookie z with a wider uncertainty.
//
// Breaks between events: teams often come back from a few weeks off with a
// changed (rebuilt) robot. After a break of at least `rebuildGapWeeks`, a
// team's prediction is less certain (extra variance per week away) and its
// next matches move its rating faster (its gain experience is capped at
// `rebuildN`), so a rebuilt robot is picked up within a few matches.
import { COMPONENTS, type Component, type MatchRecord, type TeamRating } from "./types.js";

export interface RatingParams {
  /** Update gain for a team's first match. */
  k0: number;
  /** Matches over which the gain halves. */
  n0: number;
  /** Floor for the update gain. */
  kMin: number;
  /** Multiplier on updates from playoff matches. */
  playoffWeight: number;
  /** Carry-over of last season's z-score (0 = forget, 1 = full). */
  rho1: number;
  /** Carry-over of the season before last. */
  rho2: number;
  /** Prior z for teams with no history. */
  rookieZ: number;
  /** Starting prediction variance (points², per team) for known teams / rookies. */
  uncKnown: number;
  uncRookie: number;
  /** Per-match multiplicative decay of that variance, and its floor. */
  uncDecay: number;
  uncMin: number;
  /** EMA rate for the population baseline (per-robot average contribution). */
  baseAlpha: number;
  /** Season growth: fractional scoring improvement per week since a team's last match. */
  growthPerWeek: number;
  /** Cap on weeks of growth applied at once (long breaks). */
  growthMaxWeeks: number;
  /** A break (weeks since a team's last match) at least this long counts as a
   *  possible rebuild; 0 turns rebuild handling off. */
  rebuildGapWeeks: number;
  /** After such a break, the gain is computed as if the team had played at
   *  most this many matches. */
  rebuildN: number;
  /** Extra prediction variance (points², per robot) per week of break,
   *  counting at most growthMaxWeeks. */
  rebuildUncPerWeek: number;
}

export const DEFAULT_RATING_PARAMS: RatingParams = {
  k0: 0.5,
  n0: 6,
  kMin: 0.12,
  playoffWeight: 0.5,
  rho1: 0.6,
  rho2: 0.15,
  rookieZ: -0.4,
  uncKnown: 150,
  uncRookie: 350,
  uncDecay: 0.8,
  uncMin: 10,
  baseAlpha: 0.002,
  growthPerWeek: 0.02,
  growthMaxWeeks: 8,
  rebuildGapWeeks: 0,
  rebuildN: 3,
  rebuildUncPerWeek: 0,
};

/** True when two (possibly partial) settings objects mean the same RatingBook:
 *  missing fields take their defaults, unknown fields are ignored. */
export function sameRatingParams(x: Partial<RatingParams>, y: Partial<RatingParams>): boolean {
  const fx = { ...DEFAULT_RATING_PARAMS, ...x }, fy = { ...DEFAULT_RATING_PARAMS, ...y };
  return (Object.keys(DEFAULT_RATING_PARAMS) as (keyof RatingParams)[]).every((k) => fx[k] === fy[k]);
}

type Vec = Record<Component, number>;
const zero = (): Vec => ({ auto: 0, teleop: 0, endgame: 0, pen: 0 });

export const npOf = (r: { auto: number; teleop: number; endgame: number }) => r.auto + r.teleop + r.endgame;

export class RatingBook {
  readonly params: RatingParams;
  readonly ratings = new Map<number, TeamRating>();
  /** Population baseline: average per-robot contribution per component (EMA). */
  private base: Vec = zero();
  private baseSq: Vec = zero();
  private baseReady = false;
  /** Carried-over z-scores from earlier seasons (most recent first). */
  private history = new Map<number, number[]>();
  season: number | null = null;
  /** Current time (epoch ms): advanced by update(), or set for predictions. */
  now = 0;

  constructor(params: Partial<RatingParams> = {}) {
    this.params = { ...DEFAULT_RATING_PARAMS, ...params };
  }

  /** Start a new season: snapshot z-scores of the finished one, clear ratings. */
  startSeason(season: number): void {
    if (this.season != null && this.ratings.size) {
      const totals = [...this.ratings.entries()].filter(([, r]) => r.n >= 3).map(([t, r]) => [t, npOf(r)] as const);
      const vals = totals.map(([, v]) => v);
      const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
      const seen = new Set<number>();
      for (const [t, v] of totals) {
        seen.add(t);
        const prev = this.history.get(t) ?? [];
        this.history.set(t, [(v - mean) / sd, ...prev].slice(0, 2));
      }
      // Teams that didn't play enough last season age their history by one slot.
      for (const [t, h] of this.history) if (!seen.has(t)) this.history.set(t, [NaN, ...h].slice(0, 2));
    }
    this.season = season;
    this.ratings.clear();
    this.base = zero();
    this.baseSq = zero();
    this.baseReady = false;
    this.now = 0;
  }

  /** Move the clock (e.g. to an event's start before predicting it). */
  setTime(ms: number): void {
    if (ms > this.now) this.now = ms;
  }

  /** Season-growth factor for a rating last updated at `asOf`, evaluated at `at`. */
  private growth(asOf: number | undefined, at: number): number {
    if (asOf == null || at <= asOf) return 1;
    const weeks = Math.min(this.params.growthMaxWeeks, (at - asOf) / (7 * 864e5));
    return 1 + this.params.growthPerWeek * weeks;
  }

  /** Weeks of break counted for rebuild handling (0 if it doesn't apply). */
  private breakWeeks(r: TeamRating, at: number): number {
    const { rebuildGapWeeks, growthMaxWeeks } = this.params;
    if (!rebuildGapWeeks || !r.n || r.asOf == null) return 0;
    const weeks = (at - r.asOf) / (7 * 864e5);
    return weeks >= rebuildGapWeeks ? Math.min(weeks, growthMaxWeeks) : 0;
  }

  /** Spread of per-robot contributions in this season so far (per component). */
  private sd(c: Component): number {
    const v = this.baseSq[c] - this.base[c] ** 2;
    return Math.sqrt(Math.max(v, 1));
  }

  /** Prior z for a team from its carried-over history (NaN slots = no data that season). */
  priorZ(team: number): { z: number; known: boolean } {
    const h = this.history.get(team);
    const { rho1, rho2, rookieZ } = this.params;
    if (!h || h.every((x) => Number.isNaN(x))) return { z: rookieZ, known: false };
    const z1 = h[0], z2 = h[1];
    if (!Number.isNaN(z1)) return { z: rho1 * z1 + (z2 !== undefined && !Number.isNaN(z2) ? rho2 * z2 : 0), known: true };
    // Skipped last season: use the older one with the combined decay.
    return { z: rho1 * rho2 * (z2 ?? 0) + (1 - rho1) * rookieZ, known: true };
  }

  /** A new team's season prior (not stored until it plays). */
  private prior(): TeamRating {
    const p = this.params;
    return { auto: 0, teleop: 0, endgame: 0, pen: this.base.pen, n: 0, uncertainty: this.baseReady ? p.uncKnown : p.uncRookie * 2, asOf: this.now };
  }

  private priorFor(team: number): TeamRating {
    const { z, known } = this.priorZ(team);
    const p = this.params;
    // Scale the prior z into this season's units. Penalties are not
    // carried over (z describes scoring strength); start at the baseline.
    const r = this.prior();
    r.auto = Math.max(0, this.base.auto + z * this.sd("auto"));
    r.teleop = Math.max(0, this.base.teleop + z * this.sd("teleop"));
    r.endgame = Math.max(0, this.base.endgame + z * this.sd("endgame"));
    r.uncertainty = !this.baseReady ? p.uncRookie * 2 : known ? p.uncKnown : p.uncRookie;
    return r;
  }

  /**
   * Rating as of now, as a copy: the stored rating (as of the team's last
   * match) grown for the time since. Reading never changes stored ratings,
   * so ratings depend only on match history. Unknown teams get their prior.
   */
  get(team: number): TeamRating {
    const r = this.ratings.get(team) ?? this.priorFor(team);
    const f = this.growth(r.asOf, this.now);
    const unc = r.uncertainty + this.params.rebuildUncPerWeek * this.breakWeeks(r, this.now);
    return { ...r, auto: r.auto * f, teleop: r.teleop * f, endgame: r.endgame * f, uncertainty: unc };
  }

  /** Stored rating, created from the prior on a team's first match. */
  private stored(team: number): TeamRating {
    let r = this.ratings.get(team);
    if (!r) { r = this.priorFor(team); this.ratings.set(team, r); }
    return r;
  }

  /** Expected alliance components for a set of robots. */
  allianceExpectation(teams: number[]): Vec & { np: number; uncertainty: number } {
    const out = { ...zero(), np: 0, uncertainty: 0 };
    for (const t of teams) {
      const r = this.get(t);
      for (const c of COMPONENTS) out[c] += r[c];
      out.uncertainty += r.uncertainty;
    }
    out.np = npOf(out);
    return out;
  }

  /** Fold one played match into the ratings. */
  update(m: MatchRecord): void {
    const p = this.params;
    this.setTime(m.time);
    const weight = m.level === "playoff" ? p.playoffWeight : 1;
    // Both alliances are judged against the book as it stood before this
    // match: expectations (and any newcomer's prior, which depends on the
    // population baseline) are taken first, and the baseline only moves
    // after both alliances are folded in. Before, red's result moved the
    // baseline before blue's newcomers got their priors, so the two sides of
    // one match saw different priors (and blue's saw this match's result).
    const sides = [m.red, m.blue].map((al) => ({
      al,
      exp: this.allianceExpectation(al.teams),
      actual: { auto: al.auto, teleop: al.teleop, endgame: al.endgame, pen: al.penCommitted } as Vec,
      share: 1 / al.teams.length,
    }));
    for (const t of [...m.red.teams, ...m.blue.teams]) this.stored(t); // priors from the pre-match baseline
    for (const { al, exp, actual, share } of sides) {
      for (const t of al.teams) {
        const r = this.stored(t);
        // Back from a break: less certain, and quicker to move (possible rebuild).
        const away = this.breakWeeks(r, this.now);
        if (away) {
          r.uncertainty += p.rebuildUncPerWeek * away;
          r.gainN = Math.min(r.gainN ?? r.n, p.rebuildN);
        }
        // Fold growth since the team's last match into the stored rating.
        const f = this.growth(r.asOf, this.now);
        r.auto *= f; r.teleop *= f; r.endgame *= f; r.asOf = this.now;
        const k = Math.max(p.kMin, p.k0 / (1 + (r.gainN ?? r.n) / p.n0)) * weight;
        for (const c of COMPONENTS) {
          r[c] += k * (actual[c] - exp[c]) * share;
          if (r[c] < 0) r[c] = 0; // contributions and penalties are never negative
        }
        r.n += 1;
        if (r.gainN != null) r.gainN += 1;
        r.uncertainty = Math.max(p.uncMin, r.uncertainty * p.uncDecay);
      }
    }
    // Population baseline from raw per-robot shares (independent of ratings),
    // after both alliances, in the same red-then-blue order as before.
    for (const { actual, share } of sides) {
      for (const c of COMPONENTS) {
        const x = actual[c] * share;
        if (!this.baseReady) { this.base[c] = x; this.baseSq[c] = x * x; }
        else {
          this.base[c] += p.baseAlpha * (x - this.base[c]);
          this.baseSq[c] += p.baseAlpha * (x * x - this.baseSq[c]);
        }
      }
      this.baseReady = true;
    }
  }

  /** Independent copy of the whole book (ratings, baseline, history, clock). */
  clone(): RatingBook {
    const c = new RatingBook(this.params);
    for (const [t, r] of this.ratings) c.ratings.set(t, { ...r });
    c.base = { ...this.base };
    c.baseSq = { ...this.baseSq };
    c.baseReady = this.baseReady;
    c.history = new Map([...this.history].map(([t, h]) => [t, [...h]]));
    c.season = this.season;
    c.now = this.now;
    return c;
  }

  /** Copy of current ratings, grown to now (for "as of event start" snapshots). */
  snapshot(): Map<number, TeamRating> {
    const m = new Map<number, TeamRating>();
    for (const t of this.ratings.keys()) m.set(t, this.get(t));
    return m;
  }
}
