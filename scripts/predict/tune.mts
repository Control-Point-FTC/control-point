// Predict research — tune rating + noise parameters on the TUNING season only.
//
// Coordinate descent over a small grid per parameter. Objective: mean Brier
// of live and pre-event predictions on `--tune` (default 2024), with earlier
// seasons replayed only to build priors. The test season (2025) is never
// looked at here.
//
//   npx tsx scripts/predict/tune.mts [--tune 2024] [--rounds 2]
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

const startFrom = arg("start");
let best: P = startFrom ? JSON.parse(readFileSync(startFrom, "utf8")).best : { ...DEFAULT_RATING_PARAMS, ...DEFAULT_NOISE };
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
writeFileSync(`.cache/predict/tuned-${tuneSeason}.json`, JSON.stringify({ best, bestScore }, null, 1));
