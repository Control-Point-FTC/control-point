/**
 * RatingBook: both alliances of a match are judged against the book as it
 * stood before that match (Muse's handoff, item 1: baseline seeding
 * asymmetry). A newcomer's prior comes from the population baseline, which
 * must not already include the same match's other alliance.
 */
import { describe, it, expect } from "vitest";
import { RatingBook } from "../predict/rating";
import type { MatchRecord } from "../predict/types";

const al = (teams: number[], np: number) => ({ teams, auto: np * 0.2, teleop: np * 0.7, endgame: np * 0.1, np, penCommitted: 0, total: np });
const match = (red: [number[], number], blue: [number[], number], n = 1): MatchRecord => ({
  season: 2025, eventCode: "E", level: "qual", series: 0, number: n, time: Date.UTC(2025, 10, 1) + n * 60_000,
  red: al(red[0], red[1]), blue: al(blue[0], blue[1]),
});
const comps = (b: RatingBook, t: number) => { const r = b.get(t); return [r.auto, r.teleop, r.endgame].map((x) => Math.round(x * 1e9) / 1e9); };

describe("RatingBook baseline seeding", () => {
  it("a season's first match treats both sides alike: swapping red and blue swaps the ratings", () => {
    const a = new RatingBook();
    a.update(match([[1, 2], 200], [[3, 4], 60]));
    const b = new RatingBook();
    b.update(match([[3, 4], 60], [[1, 2], 200]));
    for (const t of [1, 2, 3, 4]) expect(comps(a, t)).toEqual(comps(b, t));
  });

  it("a blue newcomer's prior doesn't include the same match's red result", () => {
    // Same history, then a match where red (known teams) scores very differently.
    const setup = () => {
      const book = new RatingBook();
      book.update(match([[1, 2], 100], [[3, 4], 100], 1));
      return book;
    };
    const lowRed = setup();
    lowRed.update(match([[1, 2], 10], [[5, 6], 100], 2));
    const highRed = setup();
    highRed.update(match([[1, 2], 400], [[5, 6], 100], 2));
    // Teams 5 and 6 played the same match with the same result: their
    // ratings can't depend on what the other alliance scored.
    expect(comps(lowRed, 5)).toEqual(comps(highRed, 5));
  });
});
