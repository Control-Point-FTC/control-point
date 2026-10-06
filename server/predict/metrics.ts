// Predict — scoring helpers for back-tests (pure).

export interface ProbOutcome {
  /** Predicted probability of the event (e.g. red wins). */
  p: number;
  /** 1 if it happened, 0 if not, 0.5 for a tie. */
  y: number;
}

export function brier(xs: ProbOutcome[]): number {
  return xs.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / Math.max(1, xs.length);
}

export function logLoss(xs: ProbOutcome[]): number {
  const eps = 1e-6;
  return -xs.reduce((s, x) => {
    const p = Math.min(1 - eps, Math.max(eps, x.p));
    return s + x.y * Math.log(p) + (1 - x.y) * Math.log(1 - p);
  }, 0) / Math.max(1, xs.length);
}

/** Share of non-tie outcomes where the favourite won. */
export function accuracy(xs: ProbOutcome[]): number {
  const decided = xs.filter((x) => x.y !== 0.5 && x.p !== 0.5);
  return decided.filter((x) => (x.p > 0.5) === (x.y === 1)).length / Math.max(1, decided.length);
}

export interface CalibrationBin { lo: number; hi: number; n: number; meanP: number; rate: number }

/** Reliability table: predicted vs observed rate in equal-width probability bins. */
export function calibration(xs: ProbOutcome[], bins = 10): CalibrationBin[] {
  const out: CalibrationBin[] = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, meanP: 0, rate: 0 }));
  for (const x of xs) {
    const b = out[Math.min(bins - 1, Math.floor(x.p * bins))];
    b.n++; b.meanP += x.p; b.rate += x.y;
  }
  for (const b of out) if (b.n) { b.meanP /= b.n; b.rate /= b.n; }
  return out;
}

/** Expected calibration error: weighted mean |predicted − observed| across bins. */
export function ece(xs: ProbOutcome[], bins = 10): number {
  const n = Math.max(1, xs.length);
  return calibration(xs, bins).reduce((s, b) => s + (b.n / n) * Math.abs(b.meanP - b.rate), 0);
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
