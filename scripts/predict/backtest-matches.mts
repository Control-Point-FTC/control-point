// Predict research — Layer 1/2 back-test: single-match predictions.
//
// Replays seasons in time order. Every prediction uses only matches that
// finished before it ("live": just before the match; "pre-event": frozen at
// the event's first match). Scores the rating model against three baselines
// on the exact same matches.
//
//   npx tsx scripts/predict/backtest-matches.mts [--params '{"k0":0.5}'] [--noise '{"a":12,"b":0.18}'] [--seasons 2022,2023,2024,2025] [--report 2024,2025] [--json out.json]
import { writeFileSync } from "node:fs";
import { loadSeason } from "./load.mts";
import { RatingBook, npOf, type RatingParams } from "../../server/predict/rating.ts";
import { phi, type NoiseParams, DEFAULT_NOISE } from "../../server/predict/matchModel.ts";
import { calibrateProb, type CalibrationParams } from "../../server/predict/calibration.ts";
import { accuracy, brier, calibration, ece, logLoss, mean, type ProbOutcome } from "../../server/predict/metrics.ts";
import type { EventRecord, MatchRecord, TeamRating } from "../../server/predict/types.ts";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };
const params: Partial<RatingParams> = JSON.parse(arg("params") ?? "{}");
const noise: NoiseParams = { ...DEFAULT_NOISE, ...JSON.parse(arg("noise") ?? "{}") };
const calArg = arg("calibration");
const calibrationParams: CalibrationParams | undefined = calArg ? JSON.parse(calArg) : undefined;
const seasons = (arg("seasons") ?? "2022,2023,2024,2025").split(",").map(Number);
const report = new Set((arg("report") ?? "2024,2025").split(",").map(Number));
const quiet = process.argv.includes("--quiet");

export interface Row {
  season: number; event: string; eventType: string; level: string;
  nMin: number;          // fewest prior matches among the 4 robots
  live: number;          // P(red wins), live ratings
  pre: number;           // P(red wins), ratings frozen at event start
  avg: number;           // baseline: season-average share difference (points)
  opr: number;           // baseline: last-event OPR difference (points)
  y: number;             // 1 red won, 0 blue won, 0.5 tie
  muR: number; muB: number; sdR: number; sdB: number; actR: number; actB: number;
  /** Live rating uncertainty summed over each alliance's robots (points²). */
  uncR: number; uncB: number;
}

/** Ridge-regularised OPR (non-penalty) from an event's qualification matches. */
function eventOpr(ev: EventRecord): Map<number, number> {
  const quals = ev.matches.filter((m) => m.level === "qual");
  const teams = [...new Set(quals.flatMap((m) => [...m.red.teams, ...m.blue.teams]))];
  const idx = new Map(teams.map((t, i) => [t, i]));
  const n = teams.length;
  if (n === 0) return new Map();
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const y = new Float64Array(n);
  for (const m of quals) for (const al of [m.red, m.blue]) {
    const ids = al.teams.map((t) => idx.get(t)!);
    for (const i of ids) { y[i] += al.np; for (const j of ids) A[i][j] += 1; }
  }
  for (let i = 0; i < n; i++) A[i][i] += 0.5; // ridge
  // Gaussian elimination
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [y[c], y[p]] = [y[p], y[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c]; if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      y[r] -= f * y[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = y[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return new Map(teams.map((t, i) => [t, x[i]]));
}

export function runBacktest(opts: { params: Partial<RatingParams>; noise: NoiseParams; seasons: number[]; report: Set<number>; events?: Map<number, EventRecord[]>; calibration?: CalibrationParams }): Row[] {
  const book = new RatingBook(opts.params);
  const rows: Row[] = [];
  for (const season of opts.seasons) {
    const events = opts.events?.get(season) ?? loadSeason(season);
    book.startSeason(season);
    // Global timeline of matches across concurrent events.
    const timeline: MatchRecord[] = events.flatMap((e) => e.matches).sort((a, b) => a.time - b.time);
    const evByCode = new Map(events.map((e) => [e.code, e]));
    const lastMatchTime = new Map(events.map((e) => [e.code, Math.max(...e.matches.map((m) => m.time))]));
    const preSnap = new Map<string, Map<number, TeamRating>>();
    // Baseline state.
    const shareSum = new Map<number, number>(), shareN = new Map<number, number>();
    let popShare = 0, popN = 0;
    const lastOpr = new Map<number, number>();
    const oprPending = [...events].sort((a, b) => lastMatchTime.get(a.code)! - lastMatchTime.get(b.code)!);
    let oprIdx = 0;

    for (const m of timeline) {
      book.setTime(m.time);
      // Events that fully finished before this match publish their OPRs.
      while (oprIdx < oprPending.length && lastMatchTime.get(oprPending[oprIdx].code)! < m.time) {
        for (const [t, v] of eventOpr(oprPending[oprIdx])) lastOpr.set(t, v);
        oprIdx++;
      }
      // Freeze ratings for this event's robots at its first match.
      if (!preSnap.has(m.eventCode)) {
        const ev = evByCode.get(m.eventCode)!;
        const snap = new Map<number, TeamRating>();
        for (const t of new Set(ev.matches.flatMap((x) => [...x.red.teams, ...x.blue.teams]))) snap.set(t, { ...book.get(t) });
        preSnap.set(m.eventCode, snap);
      }
      if (opts.report.has(season)) {
        const exp = (teams: number[], src?: Map<number, TeamRating>) => {
          let np = 0, pen = 0, unc = 0;
          for (const t of teams) { const r = src?.get(t) ?? book.get(t); np += npOf(r); pen += r.pen; unc += r.uncertainty + (src ? opts.noise.preExtra ?? 0 : 0); }
          return { np, pen, unc };
        };
        const prob = (src?: Map<number, TeamRating>) => {
          const r = exp(m.red.teams, src), b = exp(m.blue.teams, src);
          const muR = r.np + b.pen, muB = b.np + r.pen;
          const sR = Math.hypot(opts.noise.a + opts.noise.b * Math.max(0, muR), Math.sqrt(r.unc));
          const sB = Math.hypot(opts.noise.a + opts.noise.b * Math.max(0, muB), Math.sqrt(b.unc));
          const raw = phi((muR - muB) / Math.hypot(sR, sB));
          const p = opts.calibration ? calibrateProb(raw, opts.calibration) : raw;
          return { p, muR, muB, sR, sB, uncR: r.unc, uncB: b.unc };
        };
        const live = prob();
        const pre = prob(preSnap.get(m.eventCode));
        const avgOf = (t: number) => (shareN.get(t) ? shareSum.get(t)! / shareN.get(t)! : popN ? popShare / popN : 0);
        const oprOf = (t: number) => lastOpr.get(t) ?? (popN ? popShare / popN : 0);
        const sum = (ts: number[], f: (t: number) => number) => ts.reduce((s, t) => s + f(t), 0);
        const y = m.red.total > m.blue.total ? 1 : m.red.total < m.blue.total ? 0 : 0.5;
        const nMin = Math.min(...[...m.red.teams, ...m.blue.teams].map((t) => book.get(t).n));
        rows.push({
          season, event: m.eventCode, eventType: evByCode.get(m.eventCode)!.type, level: m.level, nMin,
          live: live.p, pre: pre.p,
          avg: sum(m.red.teams, avgOf) - sum(m.blue.teams, avgOf),
          opr: sum(m.red.teams, oprOf) - sum(m.blue.teams, oprOf),
          y, muR: live.muR, muB: live.muB, sdR: live.sR, sdB: live.sB, actR: m.red.total, actB: m.blue.total, uncR: live.uncR, uncB: live.uncB,
        });
      }
      // Fold the result in (ratings + baselines).
      book.update(m);
      for (const al of [m.red, m.blue]) for (const t of al.teams) {
        const s = al.np / al.teams.length;
        shareSum.set(t, (shareSum.get(t) ?? 0) + s); shareN.set(t, (shareN.get(t) ?? 0) + 1);
        popShare += s; popN++;
      }
    }
  }
  return rows;
}

/** Turn a point difference into a probability with the best single scale (fitted on `fit`). */
export function fitScale(fit: { d: number; y: number }[]): number {
  let best = 1, bestB = Infinity;
  for (let s = 2; s <= 120; s += 1) {
    const b = brier(fit.map((x) => ({ p: phi(x.d / s), y: x.y })));
    if (b < bestB) { bestB = b; best = s; }
  }
  return best;
}

export function summarize(rows: Row[], label: string, scales: { avg: number; opr: number }) {
  const pick = (f: (r: Row) => number): ProbOutcome[] => rows.map((r) => ({ p: f(r), y: r.y }));
  const models: Record<string, ProbOutcome[]> = {
    coin: pick(() => 0.5),
    avgScore: pick((r) => phi(r.avg / scales.avg)),
    lastEventOpr: pick((r) => phi(r.opr / scales.opr)),
    ratingPreEvent: pick((r) => r.pre),
    ratingLive: pick((r) => r.live),
  };
  const out: Record<string, unknown> = { label, matches: rows.length };
  for (const [k, xs] of Object.entries(models)) out[k] = { acc: +accuracy(xs).toFixed(4), brier: +brier(xs).toFixed(4), logLoss: +logLoss(xs).toFixed(4), ece: +ece(xs).toFixed(4) };
  // Score error & 80% interval coverage (live).
  const err = rows.flatMap((r) => [r.actR - r.muR, r.actB - r.muB]);
  const z80 = 1.2816;
  const cover = rows.flatMap((r) => [Math.abs(r.actR - r.muR) <= z80 * r.sdR, Math.abs(r.actB - r.muB) <= z80 * r.sdB]);
  out.scoreMAE = +mean(err.map(Math.abs)).toFixed(2);
  out.scoreBias = +mean(err).toFixed(2);
  out.interval80Coverage = +(cover.filter(Boolean).length / Math.max(1, cover.length)).toFixed(3);
  return out;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1:")}` || process.argv[1].endsWith("backtest-matches.mts")) {
  const t0 = Date.now();
  const rows = runBacktest({ params, noise, seasons, report, calibration: calibrationParams });
  // Baseline scales are fitted on the first reported season (tuning), applied to all.
  const tuneSeason = Math.min(...report);
  const tune = rows.filter((r) => r.season === tuneSeason);
  const scales = { avg: fitScale(tune.map((r) => ({ d: r.avg, y: r.y }))), opr: fitScale(tune.map((r) => ({ d: r.opr, y: r.y }))) };
  const result: Record<string, unknown> = { params: { ...params }, noise, scales, seconds: (Date.now() - t0) / 1000 };
  for (const s of [...report].sort()) {
    const rs = rows.filter((r) => r.season === s);
    result[`season${s}`] = summarize(rs, `${s} all`, scales);
    result[`season${s}_quals`] = summarize(rs.filter((r) => r.level === "qual"), `${s} quals`, scales);
    result[`season${s}_byExperience`] = Object.fromEntries(
      [[0, 0], [1, 3], [4, 9], [10, 1e9]].map(([lo, hi]) => [`${lo}-${hi === 1e9 ? "+" : hi}`, summarize(rs.filter((r) => r.nMin >= lo && r.nMin <= hi), `n ${lo}-${hi}`, scales)])
    );
    result[`season${s}_calibrationLive`] = calibration(rs.map((r) => ({ p: r.live, y: r.y })));
  }
  if (arg("json")) writeFileSync(arg("json")!, JSON.stringify({ result, rows: process.argv.includes("--rows") ? rows : undefined }));
  if (!quiet) console.log(JSON.stringify(result, null, 1));
}
