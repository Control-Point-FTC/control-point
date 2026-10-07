// Predict research — tune rating + noise parameters on the TUNING season only.
//
// Coordinate descent over a small grid per parameter. Objective: mean Brier
// of live and pre-event predictions on `--tune` (default 2024), with earlier
// seasons replayed only to build priors. The test season (2025) is never
// looked at here.
//
//   npx tsx scripts/predict/tune.mts [--tune 2024] [--rounds 2] [--start file] [--only k1,k2] [--out file] [--rebuild]
//
// --rebuild also searches the break/rebuild settings (rebuildGapWeeks,
// rebuildN, rebuildUncPerWeek); without it they stay off, as shipped (see the
// back-test report §9).
// --only limits the search to some parameters (e.g. new ones, before a full
// retune); --out writes somewhere other than .cache/predict/tuned-<season>.json.
import { readFileSync, writeFileSync } from "node:fs";
import { loadSeason } from "./load.mts";
import { runBacktest } from "./backtest-matches.mts";
import { DEFAULT_RATING_PARAMS, type RatingParams } from "../../server/predict/rating.ts";
import { DEFAULT_NOISE, type NoiseParams } from "../../server/predict/matchModel.ts";
import { brier } from "../../server/predict/metrics.ts";
import type { EventRecord } from "../../server/predict/types.ts";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };
const tuneSeason = Number(arg("tune") ?? 2024);
const rounds = Number(arg("rounds") ?? 2);
const seasons = [2022, 2023, 2024, 2025].filter((s) => s <= tuneSeason);

const events = new Map<number, EventRecord[]>();
for (const s of seasons) events.set(s, loadSeason(s));
console.log(`loaded ${seasons.join(",")} — tuning on ${tuneSeason}`);

type P = RatingParams & NoiseParams;
const grid: Partial<Record<keyof P, number[]>> = {
  growthPerWeek: [0, 0.02, 0.035, 0.05, 0.065, 0.08],
  k0: [0.3, 0.4, 0.5, 0.65, 0.8],
  n0: [3, 6, 10, 16],
  kMin: [0.08, 0.12, 0.18, 0.25, 0.33],
  playoffWeight: [0.25, 0.5, 0.75, 1],
  rho1: [0.3, 0.45, 0.6, 0.75, 0.9],
  rho2: [0, 0.1, 0.2, 0.3],
  rookieZ: [-1, -0.7, -0.4, -0.2, 0],
  uncKnown: [50, 150, 300],
  uncRookie: [150, 350, 700],
  uncDecay: [0.3, 0.45, 0.6, 0.75, 0.85, 0.92],
  a: [12, 18, 24, 30, 36, 42],
  b: [0.1, 0.14, 0.18, 0.24, 0.3],
};
if (process.argv.includes("--rebuild")) Object.assign(grid, {
  rebuildGapWeeks: [0, 2, 3, 4, 6],
  rebuildN: [0, 1, 2, 4, 6],
  rebuildUncPerWeek: [0, 25, 50, 100, 200, 400],
});
const only = arg("only")?.split(",");
if (only) {
  const unknown = only.filter((k) => !Object.prototype.hasOwnProperty.call(grid, k));
  if (unknown.length) throw new Error(`unknown or unavailable --only keys: ${unknown.join(",")} (rebuild settings need --rebuild)`);
  for (const k of Object.keys(grid) as (keyof P)[]) if (!only.includes(k)) delete grid[k];
}
if (!Object.keys(grid).length) throw new Error("nothing to search");

const startFrom = arg("start");
// Parameters missing from a start file (added since it was written) take their defaults.
let best: P = { ...DEFAULT_RATING_PARAMS, ...DEFAULT_NOISE, ...(startFrom ? JSON.parse(readFileSync(startFrom, "utf8")).best : {}) };
// Without --rebuild, rebuild handling stays off even if the start file had it on.
if (!process.argv.includes("--rebuild") && best.rebuildGapWeeks !== DEFAULT_RATING_PARAMS.rebuildGapWeeks) {
  console.log("start file has rebuild handling on; turning it off (pass --rebuild to keep it)");
  best = { ...best, rebuildGapWeeks: DEFAULT_RATING_PARAMS.rebuildGapWeeks, rebuildN: DEFAULT_RATING_PARAMS.rebuildN, rebuildUncPerWeek: DEFAULT_RATING_PARAMS.rebuildUncPerWeek };
}
const cache = new Map<string, number>();
function score(p: P): number {
  const key = JSON.stringify(p);
  if (cache.has(key)) return cache.get(key)!;
  const { a, b, ...rating } = p;
  const rows = runBacktest({ params: rating, noise: { a, b }, seasons, report: new Set([tuneSeason]), events });
  const s = (brier(rows.map((r) => ({ p: r.live, y: r.y }))) + brier(rows.map((r) => ({ p: r.pre, y: r.y })))) / 2;
  cache.set(key, s);
  return s;
}

let bestScore = score(best);
console.log(`start ${bestScore.toFixed(5)}`);
for (let round = 0; round < rounds; round++) {
  for (const [k, values] of Object.entries(grid) as [keyof P, number[]][]) {
    for (const v of values) {
      const cand = { ...best, [k]: v };
      const sc = score(cand);
      if (sc < bestScore - 1e-6) { bestScore = sc; best = cand; console.log(`  ${String(k)}=${v} → ${sc.toFixed(5)}`); }
    }
  }
  console.log(`round ${round + 1}: ${bestScore.toFixed(5)} ${JSON.stringify(best)}`);
}
writeFileSync(arg("out") ?? `.cache/predict/tuned-${tuneSeason}.json`, JSON.stringify({ best, bestScore }, null, 1));
