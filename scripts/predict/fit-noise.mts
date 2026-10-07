// Predict research — fit the match model's score uncertainty on the TUNING
// season (run after tune.mts; writes into .cache/predict/tuned-<season>.json).
//
// 1. a, b (σ = a + b·mean, plus each robot's rating uncertainty): maximise the
//    Gaussian log-likelihood of live alliance scores, so score ranges are
//    honest (tune.mts picks a, b for win-probability Brier, which tolerates
//    ranges that are too wide).
// 2. preExtra (points² per robot) for predictions made from an event-start
//    snapshot: minimise the log loss of pre-event win probabilities.
//
//   npx tsx scripts/predict/fit-noise.mts [--tune 2024] [--calibrated]
//
// --calibrated: choose preExtra with the Platt calibration from
// .cache/predict/platt-<tune>.json applied, as the server applies it. Platt
// is fitted on live predictions, which don't depend on preExtra, so the
// order is: fit-noise (a, b) → fit-platt → fit-noise --calibrated (preExtra).
import { readFileSync, writeFileSync } from "node:fs";
import { loadSeason } from "./load.mts";
import { runBacktest } from "./backtest-matches.mts";
import type { CalibrationParams } from "../../server/predict/calibration.ts";
import { sameRatingParams } from "../../server/predict/rating.ts";
import { logLoss, ece, brier } from "../../server/predict/metrics.ts";
import type { EventRecord } from "../../server/predict/types.ts";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };
const tuneSeason = Number(arg("tune") ?? 2024);
const file = `.cache/predict/tuned-${tuneSeason}.json`;
const tuned = JSON.parse(readFileSync(file, "utf8"));
const { a: _a, b: _b, preExtra: _p, noiseFit: _nf, ...rating } = tuned.best;

const seasons = [2022, 2023, 2024, 2025].filter((s) => s <= tuneSeason);
const events = new Map<number, EventRecord[]>();
for (const s of seasons) events.set(s, loadSeason(s));
const report = new Set([tuneSeason]);
const platt = process.argv.includes("--calibrated") ? JSON.parse(readFileSync(`.cache/predict/platt-${tuneSeason}.json`, "utf8")) : undefined;
// The calibration must belong to these rating settings (a, b are checked once refit below).
if (platt && (!platt.rating || !sameRatingParams(platt.rating, rating))) {
  throw new Error(`.cache/predict/platt-${tuneSeason}.json was fitted for other rating settings: run fit-noise, then fit-platt --from-tuned, then fit-noise --calibrated`);
}
const calibration: CalibrationParams | undefined = platt?.calibration;
if (calibration) console.log(`choosing preExtra with calibration ${JSON.stringify(calibration)}`);

// 1. a, b by likelihood of live scores (rows don't depend on a, b except through sd).
const rows = runBacktest({ params: rating, noise: { a: 14, b: 0.21 }, seasons, report, events });
const obs = rows.flatMap((r) => [{ mu: r.muR, act: r.actR, unc: r.uncR }, { mu: r.muB, act: r.actB, unc: r.uncB }]);
const loglik = (a: number, b: number) => {
  let ll = 0;
  for (const o of obs) {
    const s = Math.sqrt((a + b * Math.max(0, o.mu)) ** 2 + o.unc);
    const z = (o.act - o.mu) / s;
    ll += -0.5 * z * z - Math.log(s);
  }
  return ll / obs.length;
};
let best = { a: 14, b: 0.21, ll: -Infinity };
for (let a = 2; a <= 30; a += 1) for (let b = 0.05; b <= 0.35; b += 0.01) {
  const ll = loglik(a, b);
  if (ll > best.ll) best = { a, b: +b.toFixed(2), ll };
}
const coverage = obs.filter((o) => Math.abs(o.act - o.mu) <= 1.2816 * Math.sqrt((best.a + best.b * Math.max(0, o.mu)) ** 2 + o.unc)).length / obs.length;
console.log(`a=${best.a} b=${best.b} (log-lik ${best.ll.toFixed(4)}), 80% range covers ${(coverage * 100).toFixed(1)}% on ${tuneSeason}`);

if (platt && (platt.noise?.a !== best.a || platt.noise?.b !== best.b)) {
  throw new Error(`.cache/predict/platt-${tuneSeason}.json was fitted with a=${platt.noise?.a}, b=${platt.noise?.b}, not the a=${best.a}, b=${best.b} fitted now: rerun fit-platt --from-tuned`);
}

// 2. preExtra by log loss of pre-event win probabilities.
let bestPre = { preExtra: 0, logLoss: Infinity };
for (const preExtra of [0, 100, 200, 300, 400, 500, 650, 800, 1000, 1200]) {
  const rs = runBacktest({ params: rating, noise: { a: best.a, b: best.b, preExtra }, seasons, report, events, calibration });
  const xs = rs.map((r) => ({ p: r.pre, y: r.y }));
  const ll = logLoss(xs);
  console.log(`  preExtra ${preExtra}: pre-event log loss ${ll.toFixed(5)}, Brier ${brier(xs).toFixed(5)}, calibration error ${ece(xs).toFixed(4)}`);
  if (ll < bestPre.logLoss) bestPre = { preExtra, logLoss: ll };
}
console.log(`preExtra=${bestPre.preExtra}`);

tuned.best = { ...tuned.best, a: best.a, b: best.b, preExtra: bestPre.preExtra };
tuned.noiseFit = `scripts/predict/fit-noise.mts on ${tuneSeason}: a, b by Gaussian log-likelihood of live scores; preExtra by ${calibration ? "calibrated " : ""}pre-event log loss`;
writeFileSync(file, JSON.stringify(tuned, null, 1));
console.log(`updated ${file}`);
