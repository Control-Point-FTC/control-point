// Predict — Layer 2: single-match prediction.
//
// Alliance score ~ Normal(mean, variance):
//   mean     = Σ robot (auto + TeleOp + endgame) + Σ opponent penalties committed
//   variance = (a + b·mean)²  (game randomness grows with score level)
//            + Σ robot rating uncertainty (we know new/early teams less well)
// P(red wins) = Φ((μr − μb) / √(σr² + σb²)).
import type { RatingBook } from "./rating.js";

export interface NoiseParams {
  /** Score noise: σ = a + b·mean (fitted by likelihood on the tuning season). */
  a: number;
  b: number;
  /**
   * Extra per-robot variance (points²) when predicting ahead from an
   * event-start snapshot: a team's level can move during the event.
   */
  preExtra?: number;
}

export const DEFAULT_NOISE: NoiseParams = { a: 14, b: 0.21, preExtra: 0 };

export interface AlliancePrediction {
  mean: number;
  sd: number;
  np: number;
}

export interface MatchPrediction {
  red: AlliancePrediction;
  blue: AlliancePrediction;
  pRedWin: number;
}

/** Standard normal CDF (Abramowitz–Stegun erf, |error| < 1.5e-7). */
export function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function predictMatch(book: RatingBook, red: number[], blue: number[], noise: NoiseParams = DEFAULT_NOISE): MatchPrediction {
  const r = book.allianceExpectation(red);
  const b = book.allianceExpectation(blue);
  const side = (own: typeof r, opp: typeof r): AlliancePrediction => {
    const mean = own.np + opp.pen;
    const game = noise.a + noise.b * Math.max(0, mean);
    return { mean, np: own.np, sd: Math.sqrt(game * game + own.uncertainty) };
  };
  const rp = side(r, b), bp = side(b, r);
  const pRedWin = phi((rp.mean - bp.mean) / Math.sqrt(rp.sd ** 2 + bp.sd ** 2));
  return { red: rp, blue: bp, pRedWin };
}
