import { describe, it, expect } from "vitest";
import { calibrateProb, fitPlatt, plattNLL, IDENTITY_CALIBRATION } from "../predict/calibration";
import { predictMatch } from "../predict/matchModel";
import { RatingBook } from "../predict/rating";

describe("calibrateProb", () => {
  it("is the identity map for a=1, b=0", () => {
    for (const p of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      expect(calibrateProb(p, IDENTITY_CALIBRATION)).toBeCloseTo(p, 10);
    }
  });

  it("defaults to identity when no params are given", () => {
    expect(calibrateProb(0.7)).toBeCloseTo(0.7, 10);
  });

  it("is monotonic: preserves probability ordering", () => {
    const cal = { a: 0.94, b: 0.02 };
    const ps = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95];
    const qs = ps.map((p) => calibrateProb(p, cal));
    for (let i = 1; i < qs.length; i++) expect(qs[i]).toBeGreaterThan(qs[i - 1]);
  });

  it("keeps outputs strictly inside (0, 1), even for extreme inputs", () => {
    const cal = { a: 0.94, b: 0.02 };
    for (const p of [0, 1, 1e-12, 1 - 1e-12]) {
      const q = calibrateProb(p, cal);
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThan(1);
    }
  });

  it("passes non-finite inputs through untouched", () => {
    expect(calibrateProb(NaN, { a: 0.9, b: 0 })).toBeNaN();
    expect(calibrateProb(Infinity, { a: 0.9, b: 0 })).toBe(Infinity);
  });

  it("with a<1 shrinks overconfident probabilities toward 0.5", () => {
    const cal = { a: 0.5, b: 0 };
    expect(calibrateProb(0.9, cal)).toBeLessThan(0.9);
    expect(calibrateProb(0.9, cal)).toBeGreaterThan(0.5);
    expect(calibrateProb(0.1, cal)).toBeGreaterThan(0.1);
    expect(calibrateProb(0.1, cal)).toBeLessThan(0.5);
    expect(calibrateProb(0.5, cal)).toBeCloseTo(0.5, 10);
  });
});

describe("fitPlatt", () => {
  // Synthetic data: true win prob = sigmoid(0.8 * logit(p) + 0.1).
  const truth = { a: 0.8, b: 0.1 };
  const mkData = (n: number, seed: number) => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    return Array.from({ length: n }, () => {
      const p = 0.05 + rnd() * 0.9;
      const q = 1 / (1 + Math.exp(-(truth.a * Math.log(p / (1 - p)) + truth.b)));
      return { p, y: rnd() < q ? 1 : 0 };
    });
  };

  it("recovers the true params on synthetic data and improves NLL", () => {
    const data = mkData(5000, 42);
    const fit = fitPlatt(data);
    expect(fit.a).toBeCloseTo(truth.a, 1);
    expect(fit.b).toBeCloseTo(truth.b, 1);
    expect(plattNLL(data, fit)).toBeLessThan(plattNLL(data, IDENTITY_CALIBRATION));
  });

  it("returns the identity map when there is too little data", () => {
    expect(fitPlatt([])).toEqual(IDENTITY_CALIBRATION);
    expect(fitPlatt([{ p: 0.6, y: 1 }])).toEqual(IDENTITY_CALIBRATION);
  });

  it("ignores ties instead of crashing", () => {
    const data = [...mkData(100, 7), { p: 0.5, y: 0.5 }];
    const fit = fitPlatt(data);
    expect(Number.isFinite(fit.a)).toBe(true);
    expect(Number.isFinite(fit.b)).toBe(true);
    expect(fit.a).toBeGreaterThan(0);
  });

  it("skips non-finite probabilities", () => {
    const data = [...mkData(100, 9), { p: NaN, y: 1 }, { p: Infinity, y: 0 }];
    expect(() => fitPlatt(data)).not.toThrow();
  });

  it("handles extreme probabilities without producing a harmful fit", () => {
    // All predictions at the rails: the fit must not ship something worse
    // than identity, and application must stay in (0, 1).
    const data = Array.from({ length: 200 }, (_, i) => ({ p: i % 2 ? 1 - 1e-9 : 1e-9, y: i % 3 ? 1 : 0 }));
    const fit = fitPlatt(data);
    expect(Number.isFinite(fit.a) && Number.isFinite(fit.b)).toBe(true);
    expect(fit.a).toBeGreaterThan(0);
    // Whatever comes back, applying it is safe.
    for (const p of [0, 1, 1e-12, 1 - 1e-12]) {
      const q = calibrateProb(p, fit);
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThan(1);
    }
  });

  it("falls back to identity when the fit cannot beat it", () => {
    // Pure noise: no signal for the sigmoid to find. The acceptance check
    // must refuse to ship a spurious fit.
    let s = 123;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const data = Array.from({ length: 500 }, () => ({ p: 0.05 + rnd() * 0.9, y: rnd() < 0.5 ? 1 : 0 }));
    const fit = fitPlatt(data);
    // Either identity (rejected) or a fit that truly improves NLL — never worse.
    expect(plattNLL(data, fit)).toBeLessThanOrEqual(plattNLL(data, IDENTITY_CALIBRATION) + 1e-12);
  });
});

describe("predictMatch with calibration", () => {
  const book = new RatingBook();
  // Two matches so both teams have ratings.
  book.startSeason(2025);
  const t = 1_000_000;
  const mk = (red: number[], blue: number[], rs: number, bs: number) => ({
    season: 2025, eventCode: "e", level: "qual" as const, series: 1, number: 1, time: t,
    red: { teams: red, auto: rs * 0.2, teleop: rs * 0.7, endgame: rs * 0.1, np: rs, penCommitted: 0, total: rs },
    blue: { teams: blue, auto: bs * 0.2, teleop: bs * 0.7, endgame: bs * 0.1, np: bs, penCommitted: 0, total: bs },
  });
  // Several matches so ratings converge: teams 1-2 consistently outscore 3-4.
  for (let i = 0; i < 8; i++) book.update(mk([1, 2], [3, 4], 120, 80));

  it("without calibration matches the raw normal CDF", () => {
    const m = predictMatch(book, [1, 2], [3, 4]);
    expect(m.pRedWin).toBeGreaterThan(0.5);
    expect(m.pRedWin).toBeLessThan(1);
  });

  it("applies calibration to pRedWin only (means/sds untouched)", () => {
    const raw = predictMatch(book, [1, 2], [3, 4]);
    const cal = predictMatch(book, [1, 2], [3, 4], undefined, { a: 0.9, b: 0 });
    expect(cal.red.mean).toBe(raw.red.mean);
    expect(cal.blue.mean).toBe(raw.blue.mean);
    expect(cal.red.sd).toBe(raw.red.sd);
    expect(cal.pRedWin).toBeCloseTo(calibrateProb(raw.pRedWin, { a: 0.9, b: 0 }), 12);
    expect(cal.pRedWin).not.toBe(raw.pRedWin);
  });
});
