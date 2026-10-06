// Predict — award model (judged awards can't be read off match data).
//
// Each award at an event is a draw among the teams present, weighted by a
// team score (conditional logit, one weight vector for Inspire and one for
// the other judged awards):
//   score = w·[past Inspire, past judged awards, Inspire earlier this season,
//              judged earlier this season, robot strength z-score]
// Past seasons decay by `decay` per season. Fitted on 2024–25, tested on
// 2025–26. A team wins at most one judged award per event (official results
// show essentially no Inspire + other-judged combinations).

export interface AwardRecord { season: number; team: number; time: number; type: string; placement: number }

export interface AwardFeatures { pastInspire: number; pastJudged: number; seasonInspire: number; seasonJudged: number; strength: number }

export interface AwardModel {
  decay: number;
  inspire: number[]; // weights for AwardFeatures in key order
  judged: number[];
}

export const FEATURE_KEYS: (keyof AwardFeatures)[] = ["pastInspire", "pastJudged", "seasonInspire", "seasonJudged", "strength"];

/** Awards that are judged (and so modelled here). Winner/Finalist/Dean's List are not. */
export const MODELLED_AWARDS = new Set(["Inspire", "Think", "Connect", "Innovate", "Control", "Motivate", "Design", "Reach", "Sustain", "JudgesChoice", "Compass"]);

/** Index awards by team for fast feature lookups. */
export function indexAwards(records: AwardRecord[]): Map<number, AwardRecord[]> {
  const m = new Map<number, AwardRecord[]>();
  for (const r of records) if (MODELLED_AWARDS.has(r.type)) m.set(r.team, [...(m.get(r.team) ?? []), r]);
  return m;
}

/** Features for `team` at an event of `season` starting at `time` (only earlier awards count). */
export function awardFeatures(byTeam: Map<number, AwardRecord[]>, team: number, season: number, time: number, decay: number, strength: number): AwardFeatures {
  const f: AwardFeatures = { pastInspire: 0, pastJudged: 0, seasonInspire: 0, seasonJudged: 0, strength };
  for (const r of byTeam.get(team) ?? []) {
    const w = 1 / r.placement;
    if (r.season < season) {
      const d = decay ** (season - r.season - 1);
      if (r.type === "Inspire") f.pastInspire += w * d; else f.pastJudged += w * d;
    } else if (r.season === season && r.time < time) {
      if (r.type === "Inspire") f.seasonInspire += w; else f.seasonJudged += w;
    }
  }
  // Diminishing returns on counts.
  f.pastInspire = Math.log1p(f.pastInspire); f.pastJudged = Math.log1p(f.pastJudged);
  f.seasonInspire = Math.log1p(f.seasonInspire); f.seasonJudged = Math.log1p(f.seasonJudged);
  return f;
}

export function awardScore(f: AwardFeatures, w: number[]): number {
  let s = 0;
  FEATURE_KEYS.forEach((k, i) => { s += w[i] * f[k]; });
  return s;
}

/**
 * Sample winners for an event's award slots (Inspire first, then the rest in
 * the given order). Returns team → awards won.
 */
export function sampleAwards(
  slots: { type: string; placement: number }[],
  teams: number[],
  feats: Map<number, AwardFeatures>,
  model: AwardModel,
  r: () => number
): Map<number, { type: string; placement: number }[]> {
  const out = new Map<number, { type: string; placement: number }[]>();
  const wonAny = new Set<number>();
  const ordered = [...slots].sort((a, b) => (a.type === "Inspire" ? 0 : 1) - (b.type === "Inspire" ? 0 : 1) || a.placement - b.placement);
  for (const s of ordered) {
    if (!MODELLED_AWARDS.has(s.type)) continue;
    const w = s.type === "Inspire" ? model.inspire : model.judged;
    const cands = teams.filter((t) => !wonAny.has(t));
    if (!cands.length) continue;
    const ws = cands.map((t) => Math.exp(awardScore(feats.get(t)!, w)));
    const sum = ws.reduce((a, b) => a + b, 0);
    let x = r() * sum, i = 0;
    while (i < ws.length - 1 && (x -= ws[i]) > 0) i++;
    const t = cands[i];
    out.set(t, [...(out.get(t) ?? []), { type: s.type, placement: s.placement }]);
    wonAny.add(t);
  }
  return out;
}

/** Exact probability each team wins a given award slot (single draw). */
export function slotProbabilities(teams: number[], feats: Map<number, AwardFeatures>, w: number[]): Map<number, number> {
  const ws = teams.map((t) => Math.exp(awardScore(feats.get(t)!, w)));
  const sum = ws.reduce((a, b) => a + b, 0);
  return new Map(teams.map((t, i) => [t, ws[i] / sum]));
}
