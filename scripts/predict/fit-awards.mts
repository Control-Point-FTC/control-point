// Predict research — fit + test the award model.
//
// Fit (2024–25): maximise the conditional-logit likelihood of who actually won
// each first-place award slot, given features from before the event.
// Test (2025–26): calibration of P(team wins ≥ one award worth ≥ 12 points),
// P(Inspire 1st) and P(any Inspire placement) vs. a team-agnostic base rate.
//
//   npx tsx scripts/predict/fit-awards.mts
import { readFileSync, writeFileSync } from "node:fs";
import { loadSeason } from "./load.mts";
import { RatingBook, npOf } from "../../server/predict/rating.ts";
import { awardFeatures, indexAwards, sampleAwards, slotProbabilities, FEATURE_KEYS, MODELLED_AWARDS, type AwardFeatures, type AwardModel, type AwardRecord } from "../../server/predict/awards.ts";
import { rng } from "../../server/predict/sim.ts";
import { brier, calibration, ece, type ProbOutcome } from "../../server/predict/metrics.ts";
import type { EventRecord } from "../../server/predict/types.ts";

const ADV = new Set(["LeagueTournament", "Qualifier", "Championship", "SuperQualifier", "Premier"]);
const tuned = JSON.parse(readFileSync(".cache/predict/tuned-2024.json", "utf8")).best;
const { a: _a, b: _b, ...ratingParams } = tuned;

// Load all seasons; build award history + strength snapshots at event start.
const seasons = [2022, 2023, 2024, 2025];
const all = new Map<number, EventRecord[]>();
const records: AwardRecord[] = [];
for (const s of seasons) {
  const evs = loadSeason(s);
  all.set(s, evs);
  for (const e of evs) for (const aw of e.awards) records.push({ season: s, team: aw.team, time: e.startTime, type: aw.type, placement: aw.placement });
}
const byTeam = indexAwards(records);

// Strength z at event start (pre-event ratings, standardised within the event).
const strengthZ = new Map<string, Map<number, number>>();
const book = new RatingBook(ratingParams);
for (const s of seasons) {
  book.startSeason(s);
  const evs = all.get(s)!;
  const timeline = evs.flatMap((e) => e.matches).sort((x, y) => x.time - y.time);
  const teamsOf = new Map(evs.map((e) => [e.code, e.teams]));
  for (const m of timeline) {
    book.setTime(m.time);
    const key = `${s}:${m.eventCode}`;
    if (!strengthZ.has(key)) {
      const ts = teamsOf.get(m.eventCode)!;
      const v = ts.map((t) => npOf(book.get(t)));
      const mu = v.reduce((x, y) => x + y, 0) / v.length;
      const sd = Math.sqrt(v.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, v.length - 1)) || 1;
      strengthZ.set(key, new Map(ts.map((t, i) => [t, (v[i] - mu) / sd])));
    }
    book.update(m);
  }
}

interface EvAwards { e: EventRecord; teams: number[]; slots: { type: string; placement: number; winner: number }[] }
const eventsOf = (s: number): EvAwards[] => all.get(s)!.filter((e) => ADV.has(e.type) && e.teams.length >= 4).map((e) => ({
  e, teams: e.teams,
  slots: e.awards.filter((a) => MODELLED_AWARDS.has(a.type) && e.teams.includes(a.team)).map((a) => ({ type: a.type, placement: a.placement, winner: a.team })),
})).filter((x) => x.slots.length);

const feats = (ev: EvAwards, decay: number) => new Map(ev.teams.map((t) => [t, awardFeatures(byTeam, t, ev.e.season, ev.e.startTime, decay, strengthZ.get(`${ev.e.season}:${ev.e.code}`)?.get(t) ?? 0)]));

// Conditional-logit log-likelihood + gradient for one weight vector.
function fitGroup(train: EvAwards[], decay: number, isInspire: boolean): { w: number[]; ll: number } {
  const data: { F: AwardFeatures[]; win: number }[] = [];
  for (const ev of train) {
    const fm = feats(ev, decay);
    for (const s of ev.slots) {
      if ((s.type === "Inspire") !== isInspire || s.placement !== 1) continue;
      const idx = ev.teams.indexOf(s.winner);
      if (idx < 0) continue;
      data.push({ F: ev.teams.map((t) => fm.get(t)!), win: idx });
    }
  }
  // Newton–Raphson on the conditional-logit log-likelihood (concave → converges).
  const k = FEATURE_KEYS.length;
  const X = data.map((d) => d.F.map((f) => FEATURE_KEYS.map((key) => f[key])));
  let w = new Array(k).fill(0);
  let ll = -Infinity;
  for (let it = 0; it < 50; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    let cur = 0;
    data.forEach((d, n) => {
      const xs = X[n];
      const sc = xs.map((x) => x.reduce((s, v, i) => s + w[i] * v, 0));
      const mx = Math.max(...sc);
      const ex = sc.map((v) => Math.exp(v - mx));
      const Z = ex.reduce((a2, b2) => a2 + b2, 0);
      const p = ex.map((v) => v / Z);
      cur += sc[d.win] - mx - Math.log(Z);
      const mean = new Array(k).fill(0);
      xs.forEach((x, j) => x.forEach((v, i) => { mean[i] += p[j] * v; }));
      for (let i = 0; i < k; i++) g[i] += xs[d.win][i] - mean[i];
      xs.forEach((x, j) => { for (let i = 0; i < k; i++) for (let l = 0; l < k; l++) H[i][l] -= p[j] * (x[i] - mean[i]) * (x[l] - mean[l]); });
    });
    for (let i = 0; i < k; i++) H[i][i] -= 1e-6; // tiny ridge
    // Solve H·Δ = −g (Gaussian elimination on the k×k system).
    const A = H.map((row, i) => [...row.map((v) => -v), g[i]]);
    for (let c = 0; c < k; c++) {
      let piv = c; for (let rr = c + 1; rr < k; rr++) if (Math.abs(A[rr][c]) > Math.abs(A[piv][c])) piv = rr;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let rr = 0; rr < k; rr++) if (rr !== c) { const f = A[rr][c] / A[c][c]; for (let cc = c; cc <= k; cc++) A[rr][cc] -= f * A[c][cc]; }
    }
    const delta = A.map((row, i) => row[k] / row[i]);
    w = w.map((v, i) => v + delta[i]);
    const moved = delta.reduce((s, v) => s + Math.abs(v), 0);
    ll = cur;
    if (moved < 1e-8) break;
  }
  return { w, ll };
}

const train = eventsOf(2024);
let best: { model: AwardModel; ll: number } | null = null;
for (const decay of [0.2, 0.4, 0.6, 0.8, 1]) {
  const ins = fitGroup(train, decay, true), jud = fitGroup(train, decay, false);
  const ll = ins.ll + jud.ll;
  console.error(`decay ${decay}: logLik ${ll.toFixed(1)} inspire ${ins.w.map((x) => x.toFixed(2))} judged ${jud.w.map((x) => x.toFixed(2))}`);
  if (!best || ll > best.ll) best = { model: { decay, inspire: ins.w, judged: jud.w }, ll };
}
const unscaled = best!.model;
// Sharpening: real awards cluster on fewer teams than independent draws imply.
// Scale both weight vectors by s, chosen on 2024–25 (tuning) only.
function pts12Brier(evs: EvAwards[], m: AwardModel, sims: number): number {
  const rr = rng(5); const xs: ProbOutcome[] = [];
  for (const ev of evs) {
    const fm = feats(ev, m.decay);
    const slots = ev.slots.map(({ type, placement }) => ({ type, placement }));
    const cnt = new Map(ev.teams.map((t) => [t, 0]));
    for (let i = 0; i < sims; i++) for (const [t, as] of sampleAwards(slots, ev.teams, fm, m, rr)) if (as.some((x) => x.type === "Inspire" || x.placement === 1)) cnt.set(t, cnt.get(t)! + 1);
    const won = new Set(ev.slots.filter((x) => x.type === "Inspire" || x.placement === 1).map((x) => x.winner));
    for (const t of ev.teams) xs.push({ p: cnt.get(t)! / sims, y: won.has(t) ? 1 : 0 });
  }
  return brier(xs);
}
// Separate sharpening for Inspire vs. other judged awards. Inspire scale is
// chosen on Inspire-1st Brier, judged scale on P(award ≥ 12 pts) — both on 2024.
function inspireBrier(evs: EvAwards[], m: AwardModel, sims: number): number {
  const rr = rng(6); const xs: ProbOutcome[] = [];
  for (const ev of evs) {
    const fm = feats(ev, m.decay);
    const slots = ev.slots.map(({ type, placement }) => ({ type, placement }));
    const cnt = new Map(ev.teams.map((t) => [t, 0]));
    for (let i = 0; i < sims; i++) for (const [t, as] of sampleAwards(slots, ev.teams, fm, m, rr)) if (as.some((x) => x.type === "Inspire")) cnt.set(t, cnt.get(t)! + 1);
    const won = new Set(ev.slots.filter((x) => x.type === "Inspire").map((x) => x.winner));
    for (const t of ev.teams) xs.push({ p: cnt.get(t)! / sims, y: won.has(t) ? 1 : 0 });
  }
  return brier(xs);
}
const scaled = (si: number, sj: number): AwardModel => ({ ...unscaled, inspire: unscaled.inspire.map((v) => v * si), judged: unscaled.judged.map((v) => v * sj) });
let si = 1, bestI = Infinity;
for (const c of [0.75, 1, 1.25, 1.5]) { const bb = inspireBrier(train, scaled(c, 1.75), 150); console.error(`inspire scale ${c}: 2024 Brier(any Inspire) ${bb.toFixed(4)}`); if (bb < bestI) { bestI = bb; si = c; } }
let sj = 1, bestJ = Infinity;
for (const c of [1.25, 1.5, 1.75, 2, 2.25]) { const bb = pts12Brier(train, scaled(si, c), 150); console.error(`judged scale ${c}: 2024 Brier(award>=12) ${bb.toFixed(4)}`); if (bb < bestJ) { bestJ = bb; sj = c; } }
const scale = { inspire: si, judged: sj };
const model: AwardModel = scaled(si, sj);

// Test on 2025–26: simulate award draws per event; compare to outcomes.
const test = eventsOf(2025);
const r = rng(11);
const SIMS = 400;
const out = { pts12: [] as ProbOutcome[], inspire1: [] as ProbOutcome[], anyInspire: [] as ProbOutcome[] };
const base = { pts12: [] as ProbOutcome[], inspire1: [] as ProbOutcome[], anyInspire: [] as ProbOutcome[] };
for (const ev of test) {
  const fm = feats(ev, model.decay);
  const slots = ev.slots.map(({ type, placement }) => ({ type, placement }));
  const cnt = new Map(ev.teams.map((t) => [t, { p12: 0, i1: 0, ai: 0 }]));
  for (let i = 0; i < SIMS; i++) {
    const got = sampleAwards(slots, ev.teams, fm, model, r);
    for (const [t, as] of got) {
      const c = cnt.get(t)!;
      if (as.some((x) => (x.type === "Inspire") || x.placement === 1)) c.p12++;
      if (as.some((x) => x.type === "Inspire" && x.placement === 1)) c.i1++;
      if (as.some((x) => x.type === "Inspire")) c.ai++;
    }
  }
  const actual = new Map<number, { type: string; placement: number }[]>();
  for (const s of ev.slots) actual.set(s.winner, [...(actual.get(s.winner) ?? []), s]);
  const n = ev.teams.length;
  const nP12 = new Set(ev.slots.filter((s) => s.type === "Inspire" || s.placement === 1).map((s) => s.winner)).size;
  const nAI = ev.slots.filter((s) => s.type === "Inspire").length;
  for (const t of ev.teams) {
    const c = cnt.get(t)!, as = actual.get(t) ?? [];
    const y12 = as.some((x) => x.type === "Inspire" || x.placement === 1) ? 1 : 0;
    const yI1 = as.some((x) => x.type === "Inspire" && x.placement === 1) ? 1 : 0;
    const yAI = as.some((x) => x.type === "Inspire") ? 1 : 0;
    out.pts12.push({ p: c.p12 / SIMS, y: y12 }); out.inspire1.push({ p: c.i1 / SIMS, y: yI1 }); out.anyInspire.push({ p: c.ai / SIMS, y: yAI });
    base.pts12.push({ p: nP12 / n, y: y12 }); base.inspire1.push({ p: 1 / n, y: yI1 }); base.anyInspire.push({ p: nAI / n, y: yAI });
  }
}
const sum = (xs: ProbOutcome[]) => ({ n: xs.length, brier: +brier(xs).toFixed(4), ece: +ece(xs).toFixed(4) });
const report = {
  model, scale, trainEvents: train.length, testEvents: test.length,
  test: Object.fromEntries(Object.keys(out).map((k) => [k, { model: sum((out as any)[k]), teamAgnostic: sum((base as any)[k]) }])),
  calibrationPts12: calibration(out.pts12),
};
writeFileSync(".cache/predict/awards-model.json", JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.test, null, 1));
console.log("calibration P(award worth >=12):", report.calibrationPts12.filter((b) => b.n).map((b) => `${b.lo.toFixed(1)} n=${b.n} pred ${b.meanP.toFixed(3)} actual ${b.rate.toFixed(3)}`).join("\n  "));
void slotProbabilities;
