// Predict — Layer 3: Monte Carlo simulation of a whole event.
//
// One run = one plausible version of the event:
//   1. each robot's true strength for the day ~ N(rating, rating uncertainty)
//      (drawn once per run — uncertainty about a team persists across matches);
//   2. unplayed qualification matches are simulated (played ones keep their
//      real results); ranking points + tiebreakers per season rules;
//   3. alliance selection: captains in rank order pick by a softmax over
//      perceived strength (fitted pick model), where a team that would
//      otherwise captain a later alliance may decline (captainAccept);
//   4. double-elimination playoffs on the real bracket;
//   5. advancement: 2025+ points (quals + alliance + playoffs + awards) or the
//      2024 fixed order, then slots, skipping teams that already qualified.
import type { TeamRating } from "./types.js";
import type { NoiseParams } from "./matchModel.js";
import {
  BRACKETS, ORDER_2024, allianceCount, allianceSelectionPoints, awardPoints, playoffPoints, qualPoints, rankingPoints, tiebreakKeys,
  type Slot,
} from "./rules.js";
import { npOf } from "./rating.js";

// ---------------------------------------------------------------------------
// Random numbers (seeded, so results are reproducible)
// ---------------------------------------------------------------------------

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PlayedResult {
  red: { total: number; np: number; auto: number; endgame: number; bonus?: { movement: boolean; goal: boolean; pattern: boolean } };
  blue: { total: number; np: number; auto: number; endgame: number; bonus?: { movement: boolean; goal: boolean; pattern: boolean } };
}

export interface QualMatch {
  red: number[];
  blue: number[];
  result?: PlayedResult;
  /** Surrogates: they play, but the match doesn't count toward their rank. */
  noRank?: number[];
}

/** P(bonus RP) = logistic(c0 + c1 · alliance non-penalty score), per bonus (2025+). */
export interface BonusModel { movement: [number, number]; goal: [number, number]; pattern: [number, number] }

/**
 * Captain's pick: softmax over candidates of (strength / tau − rankWeight · rank / n).
 * A candidate who would captain a later alliance if left unpicked can
 * decline the invitation; captainAccept (0–1, default 1 = never declines)
 * scales that candidate's weight by the chance they accept.
 */
export interface PickModel { tau: number; rankWeight: number; captainAccept?: number }

export const DEFAULT_PICK: PickModel = { tau: 12, rankWeight: 0 };

/**
 * Pick weights for the captain of alliance `k` (0-based) of `A`, over the
 * still-unpicked `cands` in rank order. Shared by the simulation and the
 * pick-model fit so both describe the same choice.
 */
export function pickWeights(pm: PickModel, cands: number[], k: number, A: number, strength: (t: number) => number, rank: (t: number) => number, n: number): number[] {
  // Left unpicked, the best-ranked remaining teams captain the alliances still to form.
  const laterCaptains = new Set(cands.slice(0, Math.max(0, A - k - 1)));
  const accept = pm.captainAccept ?? 1;
  return cands.map((t) => Math.exp(strength(t) / pm.tau - pm.rankWeight * (rank(t) / n)) * (laterCaptains.has(t) ? accept : 1));
}

export type AwardInput =
  | { mode: "none" }
  | { mode: "actual"; awards: Map<number, { type: string; placement: number }[]> }
  | { mode: "sample"; sample: (r: () => number) => Map<number, { type: string; placement: number }[]> };

export interface SimInput {
  season: number;
  ratings: Map<number, TeamRating>;
  quals: QualMatch[];
  noise: NoiseParams;
  bonus?: BonusModel;
  pick?: PickModel;
  /** Alliances already selected (captain first), if selection has happened. */
  alliances?: number[][];
  /** Final quals ranks, if quals are over (skips simulating rankings). */
  ranks?: Map<number, number>;
  awards: AwardInput;
  /** Teams already qualified elsewhere (their slot passes down). */
  prequalified: Set<number>;
  ineligible?: Set<number>;
  slots: number;
  /** Partner scenario: force `team`'s alliance to include `partner`. */
  forcePartner?: { team: number; partner: number };
  /**
   * Playoff matches already played: bracket match number (1-based; for a
   * 2-alliance final, the game number) → winning alliance number. These keep
   * their real result; only the rest of the bracket is simulated.
   */
  playoffPlayed?: Map<number, number>;
  runs: number;
  seed?: number;
}

export interface TeamOutcome {
  team: number;
  pAdvance: number;
  pCaptain: number;
  pPicked: number;
  pWin: number;
  pFinalist: number;
  meanRank: number;
  rankP10: number;
  rankP90: number;
  /** 2025+: expected advancement points by component. */
  points: { quals: number; alliance: number; playoffs: number; awards: number; total: number };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

export function simulateEvent(input: SimInput): Map<number, TeamOutcome> {
  const r = rng(input.seed ?? 1);
  // Every team that can matter: scheduled, ranked or already on an alliance.
  const teams = [...new Set([
    ...input.quals.flatMap((m) => [...m.red, ...m.blue]),
    ...(input.ranks ? [...input.ranks.keys()] : []),
    ...(input.alliances ?? []).flat(),
  ])];
  const pick = input.pick ?? DEFAULT_PICK;
  const acc = new Map(teams.map((t) => [t, { adv: 0, cap: 0, picked: 0, win: 0, fin: 0, ranks: [] as number[], q: 0, a: 0, p: 0, w: 0 }]));
  const rating = (t: number): TeamRating => input.ratings.get(t) ?? { auto: 0, teleop: 0, endgame: 0, pen: 0, n: 0, uncertainty: 400 };

  for (let run = 0; run < input.runs; run++) {
    // 1. True strength for this run.
    const str = new Map<number, { np: number; autoShare: number; egShare: number; pen: number }>();
    for (const t of teams) {
      const rt = rating(t);
      const np = Math.max(0, npOf(rt) + normal(r) * Math.sqrt(rt.uncertainty));
      const base = Math.max(1e-6, npOf(rt));
      str.set(t, { np, autoShare: rt.auto / base, egShare: rt.endgame / base, pen: rt.pen });
    }
    const playScore = (own: number[], opp: number[]) => {
      let mean = 0, pen = 0, auto = 0, eg = 0;
      for (const t of own) { const s = str.get(t)!; mean += s.np; auto += s.np * s.autoShare; eg += s.np * s.egShare; }
      for (const t of opp) pen += str.get(t)!.pen;
      const sd = input.noise.a + input.noise.b * Math.max(0, mean + pen);
      const np = Math.max(0, mean + normal(r) * sd);
      const f = mean > 0 ? np / mean : 1;
      return { np, total: np + Math.max(0, pen + normal(r) * Math.sqrt(Math.max(pen, 1))), auto: auto * f, endgame: eg * f };
    };

    // 2. Quals → ranks.
    let rankOf: Map<number, number>;
    if (input.ranks) rankOf = input.ranks;
    else {
      const st = new Map(teams.map((t) => [t, { rp: 0, n: 0, np: 0, auto: 0, eg: 0 }]));
      for (const m of input.quals) {
        let res = m.result;
        if (!res) {
          const red = playScore(m.red, m.blue), blue = playScore(m.blue, m.red);
          const bonus = (np: number) => input.season >= 2025 && input.bonus
            ? { movement: r() < logistic(input.bonus.movement[0] + input.bonus.movement[1] * np), goal: r() < logistic(input.bonus.goal[0] + input.bonus.goal[1] * np), pattern: r() < logistic(input.bonus.pattern[0] + input.bonus.pattern[1] * np) }
            : undefined;
          res = { red: { ...red, bonus: bonus(red.np) }, blue: { ...blue, bonus: bonus(blue.np) } };
        }
        for (const [side, own, opp] of [[m.red, res.red, res.blue], [m.blue, res.blue, res.red]] as const) {
          const rp = rankingPoints(input.season, own, opp);
          for (const t of side) { if (m.noRank?.includes(t)) continue; const s = st.get(t)!; s.rp += rp; s.n++; s.np += own.np; s.auto += own.auto; s.eg += own.endgame; }
        }
      }
      const order = teams.filter((t) => st.get(t)!.n > 0).sort((x, y) => {
        const a = st.get(x)!, b = st.get(y)!;
        const d = b.rp / b.n - a.rp / a.n;
        if (Math.abs(d) > 1e-9) return d;
        const ka = tiebreakKeys(input.season, { np: a.np / a.n, auto: a.auto / a.n, endgame: a.eg / a.n });
        const kb = tiebreakKeys(input.season, { np: b.np / b.n, auto: b.auto / b.n, endgame: b.eg / b.n });
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
        return r() - 0.5;
      });
      rankOf = new Map(order.map((t, i) => [t, i + 1]));
    }
    const ranked = [...rankOf.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
    const n = ranked.length;
    for (const [t, rk] of rankOf) acc.get(t)?.ranks.push(rk);

    // 3. Alliance selection.
    let alliances: number[][];
    if (input.alliances) alliances = input.alliances;
    else {
      const A = allianceCount(n);
      const taken = new Set<number>();
      alliances = [];
      const fpair = input.forcePartner;
      for (let k = 0; k < A; k++) {
        let captain = ranked.find((t) => !taken.has(t));
        // A forced pair must get an alliance: if it is still unplaced when the
        // last alliance is formed, its higher-seeded team captains it.
        if (fpair && k === A - 1 && !taken.has(fpair.team) && !taken.has(fpair.partner)) {
          captain = (rankOf.get(fpair.team) ?? Infinity) <= (rankOf.get(fpair.partner) ?? Infinity) ? fpair.team : fpair.partner;
        }
        if (captain == null) break;
        taken.add(captain);
        let partner: number | undefined;
        const fp = input.forcePartner;
        // Partner scenario: the pair is protected — whichever of the two is
        // seeded first captains and takes the other; no one else can pick them.
        const forced = fp && (captain === fp.team || captain === fp.partner) ? (captain === fp.team ? fp.partner : fp.team) : undefined;
        if (forced != null && !taken.has(forced)) partner = forced;
        else {
          const cands = ranked.filter((t) => !taken.has(t) && !(fp && (t === fp.team || t === fp.partner)));
          if (cands.length) {
            const w = pickWeights(pick, cands, k, A, (t) => str.get(t)!.np, (t) => rankOf.get(t)!, n);
            const sum = w.reduce((a, b) => a + b, 0);
            let x = r() * sum, i = 0;
            while (i < w.length - 1 && (x -= w[i]) > 0) i++;
            partner = cands[i];
          }
        }
        if (partner != null) taken.add(partner);
        alliances.push(partner != null ? [captain, partner] : [captain]);
      }
    }
    alliances.forEach((al, i) => {
      const c = acc.get(al[0]); if (c) c.cap++;
      for (const t of al.slice(1)) { const p = acc.get(t); if (p) p.picked++; }
      void i;
    });

    // 4. Playoffs → place per alliance number (1-based).
    const place = new Map<number, number>();
    const A = alliances.length;
    const strengthOf = (k: number) => alliances[k - 1];
    const playMatch = (a: number, b: number) => {
      const sa = playScore(strengthOf(a), strengthOf(b)), sb = playScore(strengthOf(b), strengthOf(a));
      return sa.total === sb.total ? (r() < 0.5 ? a : b) : sa.total > sb.total ? a : b;
    };
    const played = input.playoffPlayed;
    if (A === 2) {
      let w1 = 0, w2 = 0, game = 0;
      while (w1 < 2 && w2 < 2) { game++; ((played?.get(game) ?? playMatch(1, 2)) === 1 ? w1++ : w2++); }
      place.set(w1 === 2 ? 1 : 2, 1); place.set(w1 === 2 ? 2 : 1, 2);
    } else if (BRACKETS[A]) {
      const br = BRACKETS[A];
      const win: number[] = [], lose: number[] = [];
      const who = (s: Slot) => ("seed" in s ? s.seed : "winnerOf" in s ? win[s.winnerOf] : lose[s.loserOf]);
      // A played match keeps its real winner (if it's one of the two alliances in that slot).
      const decide = (k: number, a: number, b: number) => { const real = played?.get(k); return real === a || real === b ? real : playMatch(a, b); };
      br.matches.forEach((m, i) => {
        const a = who(m.red), b = who(m.blue);
        const w = decide(i + 1, a, b);
        win[i + 1] = w; lose[i + 1] = w === a ? b : a;
      });
      const gf = br.matches.length;
      const upper = who(br.matches[gf - 1].red);
      let champ = win[gf], runner = lose[gf];
      if (champ !== upper) { const w = decide(gf + 1, upper, champ); champ = w; runner = w === upper ? win[gf] : upper; }
      place.set(champ, 1); place.set(runner, 2);
      br.places.forEach((ms, i) => { for (const m of ms) place.set(lose[m], 3 + i); });
    }

    // 5. Awards + advancement.
    const awards = input.awards.mode === "actual" ? input.awards.awards : input.awards.mode === "sample" ? input.awards.sample(r) : new Map();
    const seatOf = new Map<number, { k: number; seat: "captain" | "pick1" | "other" }>();
    alliances.forEach((al, i) => al.forEach((t, j) => seatOf.set(t, { k: i + 1, seat: j === 0 ? "captain" : j === 1 ? "pick1" : "other" })));
    for (const [k, p] of place) for (const t of alliances[k - 1] ?? []) { const c = acc.get(t); if (!c) continue; if (p === 1) c.win++; if (p === 2) c.fin++; }

    const advanced: number[] = [];
    const eligible = (t: number) => !input.prequalified.has(t) && !input.ineligible?.has(t) && !advanced.includes(t);
    if (input.season >= 2025) {
      const pts = ranked.map((t) => {
        const s = seatOf.get(t);
        const q = qualPoints(rankOf.get(t)!, n);
        const a = allianceSelectionPoints(s?.k ?? null, s?.seat ?? null);
        const p = s ? playoffPoints(place.get(s.k) ?? null) : 0;
        const w = awardPoints(awards.get(t) ?? []);
        const c = acc.get(t);
        if (c) { c.q += q; c.a += a; c.p += p; c.w += w; }
        return { t, total: q + a + p + w, rank: rankOf.get(t)! };
      });
      pts.sort((x, y) => y.total - x.total || x.rank - y.rank);
      for (const p of pts) { if (advanced.length >= input.slots) break; if (eligible(p.t)) advanced.push(p.t); }
    } else {
      const byPlace = (pl: number) => { for (const [k, p] of place) if (p === pl) return alliances[k - 1]; return undefined; };
      const awardWinner = (type: string, placement: number) => { for (const [t, as] of awards) if (as.some((a) => a.type === type && a.placement === placement)) return t; return undefined; };
      for (const slot of ORDER_2024) {
        if (advanced.length >= input.slots) break;
        let t: number | undefined;
        if ("award" in slot) t = awardWinner(slot.award, slot.placement);
        else if ("alliance" in slot) { const al = byPlace(slot.alliance === "winner" ? 1 : slot.alliance === "finalist" ? 2 : 3); t = al?.[slot.seat === "captain" ? 0 : 1]; }
        else t = ranked.find(eligible);
        if (t != null && eligible(t)) advanced.push(t);
      }
      // Remaining slots go down the ranking (next highest not yet advanced).
      for (const t of ranked) { if (advanced.length >= input.slots) break; if (eligible(t)) advanced.push(t); }
    }
    for (const t of advanced) { const c = acc.get(t); if (c) c.adv++; }
  }

  const out = new Map<number, TeamOutcome>();
  const R = input.runs;
  for (const [t, c] of acc) {
    const rs = [...c.ranks].sort((a, b) => a - b);
    const q = (p: number) => rs.length ? rs[Math.min(rs.length - 1, Math.floor(p * rs.length))] : NaN;
    out.set(t, {
      team: t,
      pAdvance: c.adv / R, pCaptain: c.cap / R, pPicked: c.picked / R, pWin: c.win / R, pFinalist: c.fin / R,
      meanRank: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : NaN, rankP10: q(0.1), rankP90: q(0.9),
      points: { quals: c.q / R, alliance: c.a / R, playoffs: c.p / R, awards: c.w / R, total: (c.q + c.a + c.p + c.w) / R },
    });
  }
  return out;
}
