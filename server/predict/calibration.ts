// Predict — Layer 4 (calibration): Platt scaling for win probabilities.
//
// The match model emits P(red wins) from a normal CDF over the score gap.
// Platt scaling (Niculescu-Mizil & Caruana, ICML 2005) recalibrates it with
// a 2-parameter sigmoid fitted by maximum likelihood on held-out matches:
//
//   P_cal = sigmoid(a * logit(p_raw) + b)
//
// Two parameters cannot overfit, and the sigmoid is monotonic (ranking is
// preserved). a=1, b=0 is the identity map — the safe default when no fit
// exists. Fit on the tuning season only; the test season stays untouched.

export interface CalibrationParams {
  /** Slope on logit(p). a < 1 shrinks overconfident probabilities toward 0.5. */
  a: number;
  /** Intercept (log-odds shift). */
  b: number;
}

export const IDENTITY_CALIBRATION: CalibrationParams = { a: 1, b: 0 };

const EPS = 1e-9;

function logit(p: number): number {
  const c = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(c / (1 - c));
}

function sigmoid(x: number): number {
  // Numerically stable sigmoid.
  if (x >= 0) { const e = Math.exp(-x); return 1 / (1 + e); }
  const e = Math.exp(x); return e / (1 + e);
}

/** Apply fitted Platt scaling to a raw win probability. */
export function calibrateProb(p: number, cal: CalibrationParams = IDENTITY_CALIBRATION): number {
  if (!Number.isFinite(p)) return p;
  return sigmoid(cal.a * logit(p) + cal.b);
}

/**
 * Fit (a, b) by maximum likelihood (logistic regression on logit(p)).
 * Newton-Raphson on 2 parameters; converges in a handful of iterations.
 * A small ridge keeps the Hessian well-conditioned when probabilities
 * are extreme. Returns the identity map when there is nothing to fit.
 */
export function fitPlatt(pairs: { p: number; y: number }[]): CalibrationParams {
  const rows = pairs.filter((r) => Number.isFinite(r.p) && (r.y === 0 || r.y === 1 || r.y === 0.5));
  if (rows.length < 10) return { ...IDENTITY_CALIBRATION };
  // Drop ties for fitting (they carry no win/loss signal); keep them out
  // of the likelihood rather than assigning them arbitrarily.
  const data = rows.filter((r) => r.y !== 0.5).map((r) => ({ x: logit(r.p), y: r.y }));
  if (data.length < 10) return { ...IDENTITY_CALIBRATION };

  let a = 1, b = 0;
  const ridge = 1e-4;
  let converged = false;
  for (let iter = 0; iter < 50; iter++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (const { x, y } of data) {
      const pr = sigmoid(a * x + b);
      const w = Math.max(1e-12, pr * (1 - pr));
      const d = pr - y;
      g0 += d * x; g1 += d;
      h00 += w * x * x; h01 += w * x; h11 += w;
    }
    h00 += ridge; h11 += ridge;
    const det = h00 * h11 - h01 * h01;
    if (!(det > 0)) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a -= da; b -= db;
    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) { converged = true; break; }
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ...IDENTITY_CALIBRATION };
  // Sanity: the slope must stay positive (monotonic); otherwise fall back.
  if (a <= 0) return { ...IDENTITY_CALIBRATION };
  // Acceptance: the fit must actually beat the identity map on the fitting
  // data. A stalled or diverged Newton-Raphson must never ship silently.
  if (!converged) return { ...IDENTITY_CALIBRATION };
  const fitted = { a, b };
  const backToP = data.map(({ x, y }) => ({ p: 1 / (1 + Math.exp(-x)), y }));
  if (!(plattNLL(backToP, fitted) < plattNLL(backToP, IDENTITY_CALIBRATION))) {
    return { ...IDENTITY_CALIBRATION };
  }
  return fitted;
}

/** Negative log-likelihood of (a, b) on pairs — for diagnostics / tests. */
export function plattNLL(pairs: { p: number; y: number }[], cal: CalibrationParams): number {
  let nll = 0, n = 0;
  for (const { p, y } of pairs) {
    if (y !== 0 && y !== 1) continue;
    const q = calibrateProb(p, cal);
    nll -= y * Math.log(Math.max(EPS, q)) + (1 - y) * Math.log(Math.max(EPS, 1 - q));
    n++;
  }
  return n === 0 ? Infinity : nll / n;
}
