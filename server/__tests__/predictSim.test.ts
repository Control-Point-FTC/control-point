import { describe, it, expect } from "vitest";
import { simulateEvent, pickWeights, type QualMatch } from "../predict/sim";
import type { TeamRating } from "../predict/types";

const rating = (np: number): TeamRating => ({ auto: np * 0.2, teleop: np * 0.7, endgame: np * 0.1, pen: 3, n: 10, uncertainty: 20 });

// 10 ranked teams → 2 alliances. Team k has rank k; higher-ranked teams are stronger.
const teams = Array.from({ length: 10 }, (_, i) => i + 1);
const ranks = new Map(teams.map((t) => [t, t]));
const ratings = new Map(teams.map((t) => [t, rating(120 - t * 8)]));
const quals: QualMatch[] = [{ red: [1, 2], blue: [3, 4] }];
const base = { season: 2025, ratings, quals, ranks, noise: { a: 14, b: 0.21 }, awards: { mode: "none" as const }, prequalified: new Set<number>(), slots: 3, runs: 400, seed: 3 };

describe("simulateEvent — forced partner", () => {
  it("always puts a forced pair on an alliance, even when higher captains merge", () => {
    // Rank 1 is very likely to pick rank 2 (merging the top two captains),
    // which would normally leave ranks 3/4 out of a 2-alliance bracket.
    const res = simulateEvent({ ...base, pick: { tau: 2, rankWeight: 0 }, forcePartner: { team: 3, partner: 4 } });
    expect(res.get(3)!.pCaptain).toBe(1);
    expect(res.get(4)!.pPicked).toBe(1);
    // They always reach the bracket, so they win or finish runner-up every run.
    expect(res.get(3)!.pWin + res.get(3)!.pFinalist).toBeCloseTo(1, 5);
  });

  it("never lets another captain pick a forced team", () => {
    const res = simulateEvent({ ...base, pick: { tau: 2, rankWeight: 0 }, forcePartner: { team: 1, partner: 6 } });
    expect(res.get(1)!.pCaptain).toBe(1);
    expect(res.get(6)!.pPicked).toBe(1);
    expect(res.get(6)!.pCaptain).toBe(0);
  });

  it("without forcing, the top captain usually takes the strongest team", () => {
    const res = simulateEvent({ ...base, pick: { tau: 2, rankWeight: 0 } });
    expect(res.get(2)!.pPicked).toBeGreaterThan(0.8); // so the merge case above is exercised
  });
});

// Alliance declines (Muse's handoff, item 3): a team that would captain a
// later alliance if left unpicked may turn the invitation down.
describe("pickWeights", () => {
  const strength = (t: number) => 100 - t; // team 1 strongest
  const rank = (t: number) => t;           // and ranked first
  const cands = [2, 3, 4, 5, 6, 7, 8, 9];   // captain 1 has taken itself

  it("matches the old softmax when nobody declines", () => {
    const w = pickWeights({ tau: 18, rankWeight: 3 }, cands, 0, 4, strength, rank, 9);
    cands.forEach((t, i) => expect(w[i]).toBeCloseTo(Math.exp(strength(t) / 18 - 3 * (t / 9)), 12));
  });

  it("scales only teams that would captain a later alliance", () => {
    const pm = { tau: 18, rankWeight: 3 };
    const base = pickWeights(pm, cands, 0, 4, strength, rank, 9);
    const w = pickWeights({ ...pm, captainAccept: 0.5 }, cands, 0, 4, strength, rank, 9);
    // Alliance 1 of 4: the next three teams in rank order (2, 3, 4) would captain 2–4.
    cands.forEach((t, i) => expect(w[i]).toBeCloseTo(base[i] * (t <= 4 ? 0.5 : 1), 12));
    // The last captain has no later captains to decline.
    const last = pickWeights({ ...pm, captainAccept: 0.5 }, cands, 3, 4, strength, rank, 9);
    expect(last).toEqual(pickWeights(pm, cands, 3, 4, strength, rank, 9));
  });
});
