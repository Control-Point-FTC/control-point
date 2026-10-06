// Predict research — Layer 3/4 back-test: whole events and advancement.
//
// For every advancing event with official FIRST data, simulate from three
// starting points and score against what actually happened:
//   pre      — before the event: real qual schedule, ratings frozen at start
//   quals    — after quals: real ranks, ratings after the last qual match
//   selected — after alliance selection: real alliances too
// Awards use the real results ("oracle") so this isolates the match /
// selection / playoff model; the award model is tested separately.
//
//   npx tsx scripts/predict/backtest-events.mts --season 2024 [--runs 2000] [--limit 0] [--fit-pick] [--fit-bonus]
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSeason } from "./load.mts";
import { RatingBook, npOf } from "../../server/predict/rating.ts";
import { simulateEvent, DEFAULT_PICK, type BonusModel, type PickModel, type QualMatch } from "../../server/predict/sim.ts";
import { brier, calibration, ece, logLoss, type ProbOutcome } from "../../server/predict/metrics.ts";
import type { EventRecord, MatchRecord, TeamRating } from "../../server/predict/types.ts";
import { awardFeatures, indexAwards, sampleAwards, MODELLED_AWARDS, type AwardModel, type AwardRecord } from "../../server/predict/awards.ts";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };
const season = Number(arg("season") ?? 2024);
const runs = Number(arg("runs") ?? 2000);
const limit = Number(arg("limit") ?? 0);
/** actual = real award results (reference), model = award model (the honest number), none = matches only. */
const awardMode = (arg("awards") ?? "actual") as "actual" | "model" | "none";
// Only the "model" mode needs the fitted award model (run fit-awards.mts first).
const awardModel: AwardModel | null = awardMode === "model" ? JSON.parse(readFileSync(".cache/predict/awards-model.json", "utf8")).model : null;
const awardRecords: AwardRecord[] = [];
const tuned = JSON.parse(readFileSync(".cache/predict/tuned-2024.json", "utf8")).best;
const { a, b, preExtra, noiseFit: _nf, ...ratingParams } = tuned;
const noise = { a, b, preExtra };
const partnerCheck = process.argv.includes("--partners");

// ---------------------------------------------------------------------------
// Replay the rating timeline, snapshotting each event at start and after quals.
// ---------------------------------------------------------------------------
const seasons = [2022, 2023, 2024, 2025].filter((s) => s <= season);
const book = new RatingBook(ratingParams);
let events: EventRecord[] = [];
const snapPre = new Map<string, Map<number, TeamRating>>();
const snapQuals = new Map<string, Map<number, TeamRating>>();
const bonusSamples: { np: number; m: boolean; g: boolean; p: boolean }[] = [];
for (const s of seasons) {
  const evs = loadSeason(s);
  for (const e of evs) for (const aw of e.awards) awardRecords.push({ season: s, team: aw.team, time: e.startTime, type: aw.type, placement: aw.placement });
  book.startSeason(s);
  const timeline = evs.flatMap((e) => e.matches).sort((x, y) => x.time - y.time);
  const lastQual = new Map<string, MatchRecord>();
  for (const e of evs) { const q = e.matches.filter((m) => m.level === "qual"); if (q.length) lastQual.set(e.code, q[q.length - 1]); }
  const teamsOf = new Map(evs.map((e) => [e.code, [...new Set(e.matches.flatMap((m) => [...m.red.teams, ...m.blue.teams]))]]));
  const snap = (code: string) => new Map(teamsOf.get(code)!.map((t) => [t, { ...book.get(t) }]));
  const cutoff = s === season ? timeline[Math.floor(timeline.length * 0.2)]?.time ?? 0 : 0;
  for (const m of timeline) {
    book.setTime(m.time);
    if (s === season && !snapPre.has(m.eventCode)) snapPre.set(m.eventCode, snap(m.eventCode));
    if (s === season && s >= 2025 && m.time <= cutoff && m.level === "qual") {
      for (const al of [m.red, m.blue]) if (al.bonusRp) bonusSamples.push({ np: al.np, m: al.bonusRp.movement, g: al.bonusRp.goal, p: al.bonusRp.pattern });
    }
    book.update(m);
    if (s === season && lastQual.get(m.eventCode) === m) snapQuals.set(m.eventCode, snap(m.eventCode));
  }
  if (s === season) events = evs;
}

// ---------------------------------------------------------------------------
// Bonus-RP model (2025+): logistic per bonus on alliance np, fitted on the
// earliest 20% of the season's qual matches (game mechanics, not outcomes).
// ---------------------------------------------------------------------------
function fitLogistic(xs: { x: number; y: boolean }[]): [number, number] {
  let c0 = 0, c1 = 0;
  const scale = 100;
  for (let it = 0; it < 300; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (const { x, y } of xs) {
      const z = x / scale, p = 1 / (1 + Math.exp(-(c0 + c1 * z))), w = p * (1 - p);
      g0 += (y ? 1 : 0) - p; g1 += ((y ? 1 : 0) - p) * z; h00 += w; h01 += w * z; h11 += w * z * z;
    }
    const det = h00 * h11 - h01 * h01; if (Math.abs(det) < 1e-12) break;
    const d0 = (h11 * g0 - h01 * g1) / det, d1 = (h00 * g1 - h01 * g0) / det;
    c0 += d0; c1 += d1;
    if (Math.abs(d0) + Math.abs(d1) < 1e-9) break;
  }
  return [c0, c1 / scale];
}
let bonus: BonusModel | undefined;
if (season >= 2025) {
  bonus = {
    movement: fitLogistic(bonusSamples.map((s) => ({ x: s.np, y: s.m }))),
    goal: fitLogistic(bonusSamples.map((s) => ({ x: s.np, y: s.g }))),
    pattern: fitLogistic(bonusSamples.map((s) => ({ x: s.np, y: s.p }))),
  };
  console.error(`bonus model from ${bonusSamples.length} alliance-matches:`, JSON.stringify(bonus));
}

// ---------------------------------------------------------------------------
// Official data per event.
// ---------------------------------------------------------------------------
interface Official {
  slots: number; advanced: Set<number>; prequalified: Set<number>; ineligible: Set<number>;
  alliances: number[][]; awards: Map<number, { type: string; placement: number }[]>;
}
function official(code: string, ev: EventRecord): Official | null {
  const f = join(".cache", "predict", "first", String(season), `${code}.json`);
  if (!existsSync(f)) return null;
  const d = JSON.parse(readFileSync(f, "utf8"));
  const adv = d.advancement;
  if (!adv?.advancement?.length || !adv.slots) return null;
  const advanced = new Set<number>(), pre = new Set<number>(), inel = new Set<number>();
  for (const row of adv.advancement) {
    if (!row.team) continue;
    if (row.status === "FIRST") advanced.add(row.team);
    else if (row.status === "ALREADY_ADVANCING") pre.add(row.team);
    else if (row.status === "INELIGIBLE") inel.add(row.team);
  }
  const alliances = ((d.alliances?.alliances ?? []) as any[]).sort((x, y) => x.number - y.number)
    .map((al) => [al.captain, al.round1, al.round2].filter(Boolean).map((t: any) => t.teamNumber as number));
  const awards = new Map<number, { type: string; placement: number }[]>();
  for (const aw of ev.awards) awards.set(aw.team, [...(awards.get(aw.team) ?? []), { type: aw.type, placement: aw.placement }]);
  return { slots: adv.slots, advanced, prequalified: pre, ineligible: inel, alliances, awards };
}

// ---------------------------------------------------------------------------
// Pick model fit (2024 only): likelihood of the real picks given real ranks
// and after-quals ratings, captains choosing among all unpicked teams.
// ---------------------------------------------------------------------------
function pickLogLik(pm: PickModel, list: { ranked: number[]; alliances: number[][]; strength: Map<number, number> }[]): number {
  let ll = 0;
  for (const ev of list) {
    const n = ev.ranked.length, rankOf = new Map(ev.ranked.map((t, i) => [t, i + 1]));
    const taken = new Set<number>();
    for (const al of ev.alliances) {
      if (al.length < 2) continue;
      taken.add(al[0]);
      const cands = ev.ranked.filter((t) => !taken.has(t));
      const w = cands.map((t) => Math.exp((ev.strength.get(t) ?? 0) / pm.tau - pm.rankWeight * (rankOf.get(t)! / n)));
      const sum = w.reduce((x, y) => x + y, 0);
      const i = cands.indexOf(al[1]);
      if (i >= 0) ll += Math.log(Math.max(1e-12, w[i] / sum));
      taken.add(al[1]);
    }
  }
  return ll;
}

let pick: PickModel = DEFAULT_PICK;
const pickFile = ".cache/predict/pick-2024.json";
const work = events.filter((e) => snapPre.has(e.code) && snapQuals.has(e.code)).map((e) => ({ e, off: official(e.code, e) })).filter((x) => x.off);
if (process.argv.includes("--fit-pick")) {
  const list = work.filter((x) => x.off!.alliances.length && x.e.ranks.size >= 6).map(({ e, off }) => ({
    ranked: [...e.ranks.entries()].sort((p, q) => p[1] - q[1]).map(([t]) => t),
    alliances: off!.alliances,
    strength: new Map([...snapQuals.get(e.code)!.entries()].map(([t, r]) => [t, npOf(r)])),
  }));
  let best = { pm: DEFAULT_PICK, ll: -Infinity };
  for (const tau of [3, 5, 8, 12, 18, 25, 35, 50]) for (const rankWeight of [0, 1, 2, 3, 4, 6]) {
    const ll = pickLogLik({ tau, rankWeight }, list);
    if (ll > best.ll) best = { pm: { tau, rankWeight }, ll };
  }
  // Top-3 hit rate: was the real first pick among the model's 3 likeliest?
  let hit = 0, tot = 0;
  for (const ev of list) {
    const n = ev.ranked.length, rankOf = new Map(ev.ranked.map((t, i) => [t, i + 1]));
    const taken = new Set<number>();
    for (const al of ev.alliances) {
      if (al.length < 2) continue;
      taken.add(al[0]);
      const cands = ev.ranked.filter((t) => !taken.has(t)).map((t) => ({ t, s: (ev.strength.get(t) ?? 0) / best.pm.tau - best.pm.rankWeight * (rankOf.get(t)! / n) }));
      cands.sort((x, y) => y.s - x.s);
      tot++; if (cands.slice(0, 3).some((c) => c.t === al[1])) hit++;
      taken.add(al[1]);
    }
  }
  pick = best.pm;
  writeFileSync(pickFile, JSON.stringify({ pick, logLik: best.ll, top3: hit / tot, picks: tot }, null, 1));
  console.error(`pick model ${JSON.stringify(pick)} — real pick in model's top 3: ${(100 * hit / tot).toFixed(1)}% of ${tot}`);
} else if (existsSync(pickFile)) pick = JSON.parse(readFileSync(pickFile, "utf8")).pick;

// ---------------------------------------------------------------------------
// Simulate every event from the three starting points.
// ---------------------------------------------------------------------------
type Stage = "pre" | "quals" | "selected";
const outcomes: Record<Stage, ProbOutcome[]> = { pre: [], quals: [], selected: [] };
const rankChecks: { pred: number; p10: number; p90: number; actual: number }[] = [];
const capOut: ProbOutcome[] = [], pickedOut: ProbOutcome[] = [];
const baselineTopN: ProbOutcome[] = [];
let simulated = 0;
const partnerOut = { win: [] as ProbOutcome[], winUnconditional: [] as ProbOutcome[], advCaptain: [] as ProbOutcome[], advCaptainUnconditional: [] as ProbOutcome[], advPartner: [] as ProbOutcome[] };
const awardsByTeam = indexAwards(awardRecords);
const t0 = Date.now();
for (const { e, off } of limit ? work.slice(0, limit) : work) {
  const o = off!;
  const noRank = (m: MatchRecord) => [...(m.red.surrogates ?? []), ...(m.blue.surrogates ?? [])];
  const quals: QualMatch[] = e.matches.filter((m) => m.level === "qual").map((m) => ({ red: m.red.teams, blue: m.blue.teams, noRank: noRank(m) }));
  const playedQuals: QualMatch[] = e.matches.filter((m) => m.level === "qual").map((m) => ({
    red: m.red.teams, blue: m.blue.teams, noRank: noRank(m),
    result: {
      red: { total: m.red.total, np: m.red.np, auto: m.red.auto, endgame: m.red.endgame, bonus: m.red.bonusRp },
      blue: { total: m.blue.total, np: m.blue.np, auto: m.blue.auto, endgame: m.blue.endgame, bonus: m.blue.bonusRp },
    },
  }));
  if (!quals.length || e.ranks.size < 4) continue;
  // Award input for this event.
  let awardsInput: Parameters<typeof simulateEvent>[0]["awards"] = { mode: "actual", awards: o.awards };
  if (awardMode === "none") awardsInput = { mode: "none" };
  else if (awardMode === "model" && awardModel) {
    const pre = snapPre.get(e.code)!;
    const ts = [...new Set([...e.ranks.keys(), ...pre.keys()])];
    const vals = ts.map((t) => (pre.get(t) ? npOf(pre.get(t)!) : 0));
    const mu = vals.reduce((x, y) => x + y, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
    const feats = new Map(ts.map((t, i) => [t, awardFeatures(awardsByTeam, t, season, e.startTime, awardModel.decay, (vals[i] - mu) / sd)]));
    // The event's award line-up (which awards/placements exist) is known; winners are not.
    const slots = e.awards.filter((x) => MODELLED_AWARDS.has(x.type)).map((x) => ({ type: x.type, placement: x.placement }));
    awardsInput = { mode: "sample", sample: (r) => sampleAwards(slots, ts, feats, awardModel, r) };
  }
  const common = { season, noise, bonus, pick, awards: awardsInput, prequalified: o.prequalified, ineligible: o.ineligible, slots: o.slots, runs, seed: 7 };
  const stages: [Stage, Parameters<typeof simulateEvent>[0]][] = [
    // Predicting ahead from the event start: widen each robot's uncertainty (fitted on 2024–25).
    ["pre", { ...common, ratings: new Map([...snapPre.get(e.code)!].map(([t, r]) => [t, { ...r, uncertainty: r.uncertainty + (preExtra ?? 0) }])), quals }],
    ["quals", { ...common, ratings: snapQuals.get(e.code)!, quals: playedQuals, ranks: e.ranks }],
    ["selected", { ...common, ratings: snapQuals.get(e.code)!, quals: playedQuals, ranks: e.ranks, alliances: o.alliances.length ? o.alliances : undefined }],
  ];
  const eligibleTeams = [...e.ranks.keys()].filter((t) => !o.prequalified.has(t) && !o.ineligible.has(t));
  for (const [stage, inp] of stages) {
    if (stage === "selected" && !o.alliances.length) continue;
    const res = simulateEvent(inp);
    for (const t of eligibleTeams) {
      const r = res.get(t); if (!r) continue;
      outcomes[stage].push({ p: r.pAdvance, y: o.advanced.has(t) ? 1 : 0 });
      if (stage === "pre") rankChecks.push({ pred: r.meanRank, p10: r.rankP10, p90: r.rankP90, actual: e.ranks.get(t)! });
      if (stage === "quals" && o.alliances.length) {
        const caps = new Set(o.alliances.map((al) => al[0])), picked = new Set(o.alliances.flatMap((al) => al.slice(1)));
        capOut.push({ p: r.pCaptain, y: caps.has(t) ? 1 : 0 });
        pickedOut.push({ p: r.pPicked, y: picked.has(t) ? 1 : 0 });
      }
    }
  }
  // Partner scenario check: force each real alliance at the end of quals.
  if (partnerCheck && o.alliances.length) {
    const winners = new Set(e.awards.filter((x) => x.type === "Winner").map((x) => x.team));
    const base = simulateEvent({ ...common, ratings: snapQuals.get(e.code)!, quals: playedQuals, ranks: e.ranks, runs: 500 });
    for (const al of o.alliances) {
      if (al.length < 2) continue;
      const [cap, pk] = al;
      const res = simulateEvent({ ...common, ratings: snapQuals.get(e.code)!, quals: playedQuals, ranks: e.ranks, runs: 500, forcePartner: { team: cap, partner: pk } });
      const rc = res.get(cap), rp = res.get(pk), bc = base.get(cap);
      if (!rc || !rp || !bc) continue;
      partnerOut.win.push({ p: rc.pWin, y: winners.has(cap) && winners.has(pk) ? 1 : 0 });
      partnerOut.winUnconditional.push({ p: bc.pWin, y: winners.has(cap) ? 1 : 0 });
      if (!o.prequalified.has(cap) && !o.ineligible.has(cap)) {
        partnerOut.advCaptain.push({ p: rc.pAdvance, y: o.advanced.has(cap) ? 1 : 0 });
        partnerOut.advCaptainUnconditional.push({ p: bc.pAdvance, y: o.advanced.has(cap) ? 1 : 0 });
      }
      if (!o.prequalified.has(pk) && !o.ineligible.has(pk)) partnerOut.advPartner.push({ p: rp.pAdvance, y: o.advanced.has(pk) ? 1 : 0 });
    }
  }
  // Naive baseline after quals: the top-`slots` eligible teams by rank advance.
  const topN = new Set(eligibleTeams.sort((x, y) => e.ranks.get(x)! - e.ranks.get(y)!).slice(0, o.slots));
  for (const t of eligibleTeams) baselineTopN.push({ p: topN.has(t) ? 1 : 0, y: o.advanced.has(t) ? 1 : 0 });
  if (++simulated % 50 === 0) console.error(`${simulated} events simulated (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const summary = (xs: ProbOutcome[]) => ({ n: xs.length, brier: +brier(xs).toFixed(4), logLoss: +logLoss(xs).toFixed(4), ece: +ece(xs).toFixed(4), baseRate: +(xs.reduce((s, x) => s + x.y, 0) / Math.max(1, xs.length)).toFixed(4) });
const spearman = (() => {
  // Within-event rank correlation is approximated by overall Pearson on ranks normalised later; report MAE + coverage.
  const mae = rankChecks.reduce((s, r) => s + Math.abs(r.pred - r.actual), 0) / Math.max(1, rankChecks.length);
  const cov = rankChecks.filter((r) => r.actual >= r.p10 && r.actual <= r.p90).length / Math.max(1, rankChecks.length);
  return { rankMAE: +mae.toFixed(2), rank80Coverage: +cov.toFixed(3) };
})();
const report = {
  season, runs, awardMode, events: simulated, pick, bonus,
  advancement: { pre: summary(outcomes.pre), quals: summary(outcomes.quals), selected: summary(outcomes.selected), baselineTopNByRank: summary(baselineTopN) },
  calibrationPre: calibration(outcomes.pre), calibrationQuals: calibration(outcomes.quals), calibrationSelected: calibration(outcomes.selected),
  ranks: spearman,
  selection: { captain: summary(capOut), picked: summary(pickedOut) },
  partners: partnerCheck ? Object.fromEntries(Object.entries(partnerOut).map(([k, v]) => [k, summary(v)])) : undefined,
  partnerCalibrationWin: partnerCheck ? calibration(partnerOut.win) : undefined,
};
writeFileSync(`.cache/predict/events-${season}-${awardMode}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.advancement, null, 1), "\nranks", JSON.stringify(report.ranks), "\nselection", JSON.stringify(report.selection), partnerCheck ? "\npartners " + JSON.stringify(report.partners, null, 1) : "");
