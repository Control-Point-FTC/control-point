// Predict research — fit Platt scaling on the tuning season, evaluate on test.
//
//   npx tsx scripts/predict/fit-platt.mts [--tune 2024] [--test 2025]
//
// Fits (a, b) on the tuning season's live predictions (held out from the
// test season), then reports live + pre-event metrics on the test season
// with and without calibration. Ship only if Brier improves out-of-sample.
import { readFileSync } from "node:fs";
import { runBacktest, fitScale, summarize } from "./backtest-matches.mts";
import { fitPlatt, plattNLL, type CalibrationParams } from "../../server/predict/calibration.ts";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };
const tuneSeason = Number(arg("tune") ?? 2024);
const testSeason = Number(arg("test") ?? 2025);

const M = JSON.parse(readFileSync("server/predict/model.json", "utf8"));
const params = M.rating;
const noise = M.noise;
const seasons = [2022, 2023, tuneSeason, testSeason].filter((s, i, a) => a.indexOf(s) === i).sort();

// 1. Fit on the tuning season.
const tuneRows = runBacktest({ params, noise, seasons, report: new Set([tuneSeason]) });
const tuneLive = tuneRows.map((r) => ({ p: r.live, y: r.y }));
const cal: CalibrationParams = fitPlatt(tuneLive);
console.log("fitted:", JSON.stringify(cal));
console.log("tune NLL identity:", plattNLL(tuneLive, { a: 1, b: 0 }).toFixed(5),
  "fitted:", plattNLL(tuneLive, cal).toFixed(5));

// 2. Evaluate on the test season, with and without.
for (const [label, c] of [["uncalibrated", undefined], ["platt", cal]] as const) {
  const rows = runBacktest({ params, noise, seasons, report: new Set([testSeason]), calibration: c ?? undefined });
  const tuneForScales = tuneRows;
  const scales = {
    avg: fitScale(tuneForScales.map((r) => ({ d: r.avg, y: r.y }))),
    opr: fitScale(tuneForScales.map((r) => ({ d: r.opr, y: r.y }))),
  };
  const s = summarize(rows, `${testSeason} ${label}`, scales) as Record<string, { acc: number; brier: number; logLoss: number; ece: number }>;
  console.log(`--- ${label} (test ${testSeason}) ---`);
  for (const m of ["ratingLive", "ratingPreEvent", "lastEventOpr", "avgScore"]) {
    const x = s[m];
    console.log(`${m}: acc=${x.acc} brier=${x.brier} logLoss=${x.logLoss} ece=${x.ece}`);
  }
}
