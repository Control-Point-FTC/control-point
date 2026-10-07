// Predict research — export the fitted model for the server.
//
// Reads the research outputs in .cache/predict/ and writes
// server/predict/model.json (committed): rating settings, score noise, the
// pick, bonus-RP and award models, plus the accuracy summary the Predict tab
// shows. Run after the back-tests (see docs/predict/backtest-report.md).
//
//   npx tsx scripts/predict/export-model.mts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { sameRatingParams } from "../../server/predict/rating.ts";

const C = ".cache/predict";
const read = (f: string) => JSON.parse(readFileSync(`${C}/${f}`, "utf8"));
const tuned = read("tuned-2024.json").best;
const { a, b, preExtra, ...rating } = tuned;
const pick = read("pick-2024.json").pick;
const awards = read("awards-model.json");
const ev = read("events-2025-model.json");
const evNone = read("events-2025-none.json");
const matches = read("final-test.json").result;
// Platt calibration (fit-platt.mts). It's only valid for the settings it was
// fitted with (live odds depend on rating, a and b), so a fit for different
// settings is refused. Without a fit, keep the shipped one rather than
// silently dropping it.
let calibration = JSON.parse(readFileSync("server/predict/model.json", "utf8")).calibration;
if (existsSync(`${C}/platt-2024.json`)) {
  const platt = read("platt-2024.json");
  if (!platt.rating || !sameRatingParams(platt.rating, rating) || platt.noise?.a !== a || platt.noise?.b !== b) {
    throw new Error(`${C}/platt-2024.json was fitted for other settings than tuned-2024.json: rerun fit-platt.mts (--from-tuned)`);
  }
  calibration = platt.calibration;
}

const pickAdv = (st: string) => ({ brier: ev.advancement[st].brier, calibrationError: ev.advancement[st].ece });
const model = {
  version: 1,
  fittedOn: "2024–25 (settings), tested on 2025–26",
  rating,
  noise: { a, b, preExtra },
  pick,
  /** Bonus-RP chances (2025–26 game): logistic in alliance non-penalty score. */
  bonus: { 2025: ev.bonus },
  awards: awards.model,
  accuracy: {
    testSeason: "2025–26",
    matches: {
      count: matches.season2025.matches,
      liveAccuracy: matches.season2025.ratingLive.acc,
      liveBrier: matches.season2025.ratingLive.brier,
      preEventAccuracy: matches.season2025.ratingPreEvent.acc,
      oprAccuracy: matches.season2025.lastEventOpr.acc,
      oprBrier: matches.season2025.lastEventOpr.brier,
      scoreRange80Coverage: matches.season2025.interval80Coverage,
    },
    advancement: {
      events: ev.events,
      pre: pickAdv("pre"),
      quals: pickAdv("quals"),
      selected: pickAdv("selected"),
      matchesOnlyPre: { brier: evNone.advancement.pre.brier, calibrationError: evNone.advancement.pre.ece },
      naiveTopRanked: { brier: ev.advancement.baselineTopNByRank.brier },
      calibrationPre: ev.calibrationPre.filter((x: any) => x.n).map((x: any) => ({ predicted: +x.meanP.toFixed(3), actual: +x.rate.toFixed(3), n: x.n })),
    },
    partners: ev.partners ? { allianceWin: ev.partners.win, allianceWinGeneral: ev.partners.winUnconditional } : null,
    pickTop3: read("pick-2024.json").top3,
  },
  ...(calibration ? { calibration } : {}),
};
writeFileSync("server/predict/model.json", JSON.stringify(model, null, 1) + "\n");
console.log("wrote server/predict/model.json");
