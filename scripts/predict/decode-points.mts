// Predict research — Phase 0: decode the 2025–26 advancement-points rules.
//
// Joins FIRST's official per-team points breakdown with raw event results
// (quals rank + team count, alliance seat, playoff finish, awards) and
// prints what each component equals as a function of its inputs, so the
// formulas can be read off and then verified exactly.
//
// Points vector (FIRST advancement/{code}/points):
//   [total, awards, playoffs, allianceSelection, quals, ...tiebreakers]
//
//   npx tsx scripts/predict/decode-points.mts [--season 2025]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const season = Number(process.argv[process.argv.indexOf("--season") + 1] || 2025);
const ROOT = join(process.cwd(), ".cache", "predict");

interface Joined {
  event: string; type: string; team: number; n: number; rank: number | null;
  seat: string | null; allianceNo: number | null; finish: number | null;
  awards: string[]; pts: number[];
}

/** Playoff finishing place per alliance number from double-elimination results. */
function playoffFinish(scout: any, alliances: any[]): Map<number, number> {
  const teamToAlliance = new Map<number, number>();
  for (const a of alliances) for (const k of ["captain", "round1", "round2", "round3", "backup"]) if (a[k]?.teamNumber) teamToAlliance.set(a[k].teamNumber, a.number);
  const playoffs = (scout.matches ?? []).filter((m: any) => !String(m.tournamentLevel).toLowerCase().startsWith("qual") && m.hasBeenPlayed && m.scores)
    .sort((x: any, y: any) => (x.series - y.series) || (x.matchNum - y.matchNum));
  const losses = new Map<number, number>(), lastSeen = new Map<number, number>(), wins = new Map<number, number>();
  let order = 0;
  for (const m of playoffs) {
    order++;
    const side = (c: string) => teamToAlliance.get((m.teams ?? []).find((t: any) => t.alliance === c)?.teamNumber);
    const r = side("Red"), b = side("Blue");
    if (!r || !b) continue;
    lastSeen.set(r, order); lastSeen.set(b, order);
    const rs = m.scores.red.totalPoints, bs = m.scores.blue.totalPoints;
    if (rs === bs) continue;
    const [w, l] = rs > bs ? [r, b] : [b, r];
    wins.set(w, (wins.get(w) ?? 0) + 1);
    losses.set(l, (losses.get(l) ?? 0) + 1);
  }
  // Order: winner = alliance with fewest losses that played last; then by how late they were knocked out.
  const played = [...lastSeen.keys()];
  const ranked = played.sort((x, y) => (lastSeen.get(y)! - lastSeen.get(x)!) || ((losses.get(x) ?? 0) - (losses.get(y) ?? 0)) || ((wins.get(y) ?? 0) - (wins.get(x) ?? 0)));
  // The final's two alliances share the last match; the winner has fewer losses / won the last match.
  const out = new Map<number, number>();
  ranked.forEach((a, i) => out.set(a, i + 1));
  return out;
}

const firstDir = join(ROOT, "first", String(season));
const scoutDir = join(ROOT, "scout", String(season));
const rows: Joined[] = [];
for (const f of readdirSync(firstDir)) {
  const first = JSON.parse(readFileSync(join(firstDir, f), "utf8"));
  if (!Array.isArray(first.points) || !first.alliances?.alliances) continue;
  const sf = join(scoutDir, `${first.code}.json`);
  if (!existsSync(sf)) continue;
  const scout = JSON.parse(readFileSync(sf, "utf8"))?.data?.eventByCode;
  if (!scout) continue;
  const alliances = first.alliances.alliances as any[];
  const seat = new Map<number, [string, number]>();
  for (const a of alliances) for (const [k, s] of [["captain", "C"], ["round1", "P1"], ["round2", "P2"], ["round3", "P3"], ["backup", "B"]] as const) if (a[k]?.teamNumber) seat.set(a[k].teamNumber, [s, a.number]);
  const finish = playoffFinish(scout, alliances);
  const rank = new Map<number, number>((scout.teams ?? []).filter((t: any) => t.stats?.rank).map((t: any) => [t.teamNumber, t.stats.rank]));
  const n = rank.size;
  const awards = new Map<number, string[]>();
  for (const a of scout.awards ?? []) if (a.teamNumber) awards.set(a.teamNumber, [...(awards.get(a.teamNumber) ?? []), `${a.type}${a.placement}`]);
  for (const p of first.points as { team: number; points: number[] }[]) {
    const s = seat.get(p.team);
    rows.push({ event: first.code, type: first.type, team: p.team, n, rank: rank.get(p.team) ?? null, seat: s?.[0] ?? null, allianceNo: s?.[1] ?? null, finish: s ? finish.get(s[1]) ?? null : null, awards: awards.get(p.team) ?? [], pts: p.points });
  }
}
console.log(`${rows.length} team results across ${new Set(rows.map((r) => r.event)).size} events`);

// Sanity: total = awards + playoffs + alliance + quals?
const sumOk = rows.filter((r) => r.pts[0] === r.pts[1] + r.pts[2] + r.pts[3] + r.pts[4]).length;
console.log(`total = sum of 4 parts: ${sumOk}/${rows.length}`);

const table = (title: string, key: (r: Joined) => string | null, val: (r: Joined) => number) => {
  const m = new Map<string, Map<number, number>>();
  for (const r of rows) { const k = key(r); if (k == null) continue; const v = val(r); const mm = m.get(k) ?? new Map(); mm.set(v, (mm.get(v) ?? 0) + 1); m.set(k, mm); }
  console.log(`\n== ${title}`);
  for (const [k, mm] of [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    console.log(`${k.padEnd(14)} ${[...mm.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v}×${c}`).join("  ")}`);
  }
};
table("alliance pts by seat (seat:allianceNo)", (r) => (r.seat ? `${r.seat}:A${r.allianceNo}` : "none"), (r) => r.pts[3]);
table("playoff pts by finish place", (r) => (r.finish ? `place${r.finish}` : r.seat ? "seat-noplay" : null), (r) => r.pts[2]);
table("award pts by award set", (r) => (r.awards.filter((a) => !/^(Winner|Finalist)/.test(a)).sort().join("+") || "none"), (r) => r.pts[1]);
// Quals: points vs (n, rank) — print a compact matrix for common field sizes.
const byN = new Map<number, Map<number, Set<number>>>();
for (const r of rows) if (r.rank) { const m = byN.get(r.n) ?? new Map(); const s = m.get(r.rank) ?? new Set(); s.add(r.pts[4]); m.set(r.rank, s); byN.set(r.n, m); }
console.log("\n== quals pts by field size n → [rank:pts]");
for (const [n, m] of [...byN.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`n=${n}: ${[...m.entries()].sort((a, b) => a[0] - b[0]).map(([rk, s]) => `${rk}:${[...s].join("/")}`).join(" ")}`);
}
