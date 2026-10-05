// Predict — season rules for simulating an event and its advancement.
//
// Everything here was read off official data, not assumed:
// - alliance counts, brackets and finals format: 2024–25 + 2025–26 playoff
//   matches joined with FIRST alliance selections (≈1,250 events);
// - ranking points + tiebreakers: recomputed vs. official ranks
//   (2025: 100% RP match, 99.7% rank match; 2024: 99.8% / 99.8%);
// - 2025–26 advancement points: reproduced FIRST's per-team breakdown
//   (all components; quals formula 780/789, misses = team-count mismatch);
// - 2024–25 fixed advancement order: FIRST advancement lists.

/** Number of playoff alliances for a field of n ranked teams. */
export function allianceCount(n: number): number {
  if (n <= 10) return 2;
  if (n <= 20) return 4;
  if (n <= 40) return 6;
  return 8;
}

/** A bracket slot: a seed, or the winner/loser of an earlier match (1-based). */
export type Slot = { seed: number } | { winnerOf: number } | { loserOf: number };
export interface BracketMatch { red: Slot; blue: Slot }

const S = (seed: number): Slot => ({ seed });
const W = (m: number): Slot => ({ winnerOf: m });
const L = (m: number): Slot => ({ loserOf: m });

/**
 * Double-elimination brackets (single matches). The last listed match is the
 * grand final; if the lower-bracket alliance wins it, it is replayed once
 * (the upper-bracket alliance must lose twice).
 * `places` lists, from 3rd place down, which match's loser finishes there.
 */
export interface Bracket { matches: BracketMatch[]; places: number[][] }

export const BRACKETS: Record<number, Bracket> = {
  4: {
    matches: [
      { red: S(1), blue: S(4) }, { red: S(2), blue: S(3) },   // 1, 2
      { red: L(1), blue: L(2) }, { red: W(1), blue: W(2) },   // 3, 4
      { red: L(4), blue: W(3) },                              // 5 lower final
      { red: W(4), blue: W(5) },                              // 6 grand final
    ],
    places: [[5], [3]], // 3rd: loser of 5; 4th: loser of 3
  },
  6: {
    matches: [
      { red: S(4), blue: S(5) }, { red: S(3), blue: S(6) },   // 1, 2
      { red: S(1), blue: W(1) }, { red: S(2), blue: W(2) },   // 3, 4
      { red: L(3), blue: L(2) }, { red: L(4), blue: L(1) },   // 5, 6
      { red: W(3), blue: W(4) },                              // 7 upper final
      { red: W(6), blue: W(5) },                              // 8
      { red: L(7), blue: W(8) },                              // 9 lower final
      { red: W(7), blue: W(9) },                              // 10 grand final
    ],
    places: [[9], [8], [5, 6]], // 3rd, 4th, 5th–6th
  },
  8: {
    matches: [
      { red: S(1), blue: S(8) }, { red: S(4), blue: S(5) }, { red: S(2), blue: S(7) }, { red: S(3), blue: S(6) }, // 1–4
      { red: L(1), blue: L(2) }, { red: L(3), blue: L(4) },   // 5, 6
      { red: W(1), blue: W(2) }, { red: W(3), blue: W(4) },   // 7, 8
      { red: L(7), blue: W(6) }, { red: L(8), blue: W(5) },   // 9, 10
      { red: W(7), blue: W(8) },                              // 11 upper final
      { red: W(10), blue: W(9) },                             // 12
      { red: L(11), blue: W(12) },                            // 13 lower final
      { red: W(11), blue: W(13) },                            // 14 grand final
    ],
    places: [[13], [12], [9, 10], [5, 6]],
  },
};

/** Ranking points for one alliance in one qualification match. */
export function rankingPoints(season: number, own: { total: number; bonus?: { movement: boolean; goal: boolean; pattern: boolean } }, opp: { total: number }): number {
  const win = own.total > opp.total, tie = own.total === opp.total;
  if (season >= 2025) {
    const b = own.bonus;
    return (win ? 3 : tie ? 1 : 0) + (b ? Number(b.movement) + Number(b.goal) + Number(b.pattern) : 0);
  }
  return win ? 2 : tie ? 1 : 0;
}

/** Sort key after average RP (higher is better), per season. */
export function tiebreakKeys(season: number, avg: { np: number; auto: number; endgame: number }): number[] {
  return season >= 2025 ? [avg.np] : [avg.auto, avg.endgame];
}

// ---------------------------------------------------------------------------
// 2025–26 advancement points
// ---------------------------------------------------------------------------

/** Inverse error function (Giles 2010 single-precision approximation, refined by Newton). */
export function erfinv(x: number): number {
  const w0 = -Math.log((1 - x) * (1 + x));
  let p: number;
  if (w0 < 5) {
    const w = w0 - 2.5;
    p = 2.81022636e-08;
    for (const c of [3.43273939e-07, -3.5233877e-06, -4.39150654e-06, 0.00021858087, -0.00125372503, -0.00417768164, 0.246640727, 1.50140941]) p = c + p * w;
  } else {
    const w = Math.sqrt(w0) - 3;
    p = -0.000200214257;
    for (const c of [0.000100950558, 0.00134934322, -0.00367342844, 0.00573950773, -0.0076224613, 0.00943887047, 1.00167406, 2.83297682]) p = c + p * w;
  }
  let y = p * x;
  // Two Newton steps on erf(y) = x for full double precision.
  for (let i = 0; i < 2; i++) y -= (erf(y) - x) / ((2 / Math.sqrt(Math.PI)) * Math.exp(-y * y));
  return y;
}

/** erf via Abramowitz–Stegun 7.1.26 refined with a series near 0 (|err| < 1e-9 after Newton use). */
export function erf(x: number): number {
  // High-precision erf: series for small |x|, continued fraction complement otherwise.
  const ax = Math.abs(x);
  if (ax < 2.5) {
    let sum = x, term = x, n = 0;
    while (Math.abs(term) > 1e-16 * Math.abs(sum) && n < 200) { n++; term *= -x * x / n; sum += term / (2 * n + 1); }
    return (2 / Math.sqrt(Math.PI)) * sum;
  }
  // erfc continued fraction (Lentz)
  let f = ax, C = ax, D = 0;
  for (let i = 1; i < 200; i++) {
    const a = i / 2;
    D = ax + a * D; D = D === 0 ? 1e-300 : 1 / D;
    C = ax + a / C; if (C === 0) C = 1e-300;
    const delta = C * D; f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  const erfc = Math.exp(-ax * ax) / (f * Math.sqrt(Math.PI));
  return x >= 0 ? 1 - erfc : erfc - 1;
}

const QUAL_ALPHA = 1.07;
const QUAL_K = erfinv(1 / QUAL_ALPHA);

/** Qualification-performance points for rank r of n ranked teams (2025–26). */
export function qualPoints(rank: number, n: number): number {
  return Math.ceil(erfinv((n - 2 * rank + 2) / (QUAL_ALPHA * n)) * (7 / QUAL_K) + 9);
}

/** Alliance-selection points: captain and first pick of alliance k get 21 − k; others 0. */
export function allianceSelectionPoints(allianceNo: number | null, seat: "captain" | "pick1" | "other" | null): number {
  if (allianceNo == null || (seat !== "captain" && seat !== "pick1")) return 0;
  return 21 - allianceNo;
}

/** Playoff points by finishing place (1st 40, 2nd 20, 3rd 10, 4th 5). */
export function playoffPoints(place: number | null): number {
  return place === 1 ? 40 : place === 2 ? 20 : place === 3 ? 10 : place === 4 ? 5 : 0;
}

/** Award points: only a team's single highest award counts. */
export function awardPoints(awards: { type: string; placement: number }[]): number {
  let best = 0;
  for (const a of awards) {
    let p = 0;
    if (a.type === "Inspire") p = [0, 60, 30, 15][a.placement] ?? 0;
    else if (JUDGED_AWARDS.has(a.type)) p = [0, 12, 6, 3][a.placement] ?? 0;
    best = Math.max(best, p);
  }
  return best;
}

/** Judged awards worth 12/6/3 (Dean's List, winner/finalist awards are worth 0). */
export const JUDGED_AWARDS = new Set(["Think", "Connect", "Innovate", "Control", "Motivate", "Design", "Reach", "Sustain", "JudgesChoice", "Compass"]);

// ---------------------------------------------------------------------------
// 2024–25 fixed advancement order (most common published order)
// ---------------------------------------------------------------------------

export type OrderSlot =
  | { award: string; placement: number }
  | { alliance: "winner" | "finalist" | "third"; seat: "captain" | "partner" }
  | { highestRanked: true };

export const ORDER_2024: OrderSlot[] = [
  { award: "Inspire", placement: 1 },
  { alliance: "winner", seat: "captain" },
  { alliance: "winner", seat: "partner" },
  { award: "Inspire", placement: 2 },
  { award: "Inspire", placement: 3 },
  { alliance: "finalist", seat: "captain" },
  { award: "Think", placement: 1 },
  { alliance: "finalist", seat: "partner" },
  { award: "Connect", placement: 1 },
  { highestRanked: true },
  { alliance: "third", seat: "captain" },
  { award: "Innovate", placement: 1 },
  { alliance: "third", seat: "partner" },
  { award: "Control", placement: 1 },
  { award: "Motivate", placement: 1 },
  { award: "Design", placement: 1 },
];
