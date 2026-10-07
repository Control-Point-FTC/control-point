// Predict research — do ratings lag after a break between events?
//
// Replays seasons with the shipped settings and, for every alliance in the
// reported season, records its non-penalty score error (actual − expected)
// tagged with the longest break any of its robots just had (weeks since that
// robot's previous match) and how many matches it has played since. If teams
// come back from long breaks changed (rebuilt robots), errors right after a
// break are larger, and their sign shows whether the change is mostly up.
//
//   npx tsx scripts/predict/gap-residuals.mts [--season 2024] [--tuned .cache/predict/tuned-2024.json]
//
// --tuned: rating settings from a tune file instead of the shipped model.json.
import { readFileSync } from "node:fs";
import { loadSeason } from "./load.mts";
import { RatingBook, npOf } from "../../server/predict/rating.ts";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };
const season = Number(arg("season") ?? 2024);
const tunedFile = arg("tuned");
const rating = tunedFile
  ? (({ a: _a, b: _b, preExtra: _p, ...r }) => r)(JSON.parse(readFileSync(tunedFile, "utf8")).best)
  : JSON.parse(readFileSync("server/predict/model.json", "utf8")).rating;
const book = new RatingBook(rating);
const WEEK = 7 * 864e5;
const buckets = new Map<string, { n: number; sum: number; abs: number; sq: number }>();
const add = (k: string, e: number) => {
  const b = buckets.get(k) ?? { n: 0, sum: 0, abs: 0, sq: 0 };
  b.n++; b.sum += e; b.abs += Math.abs(e); b.sq += e * e; buckets.set(k, b);
};

for (const s of [2022, 2023, 2024, 2025].filter((x) => x <= season)) {
  book.startSeason(s);
  const last = new Map<number, number>(), since = new Map<number, number>(), gapOf = new Map<number, number>();
  const timeline = loadSeason(s).flatMap((e) => e.matches).sort((a, b) => a.time - b.time);
  for (const m of timeline) {
    book.setTime(m.time);
    for (const t of [...m.red.teams, ...m.blue.teams]) {
      const prev = last.get(t);
      if (prev != null && m.time - prev >= 2 * WEEK) { gapOf.set(t, (m.time - prev) / WEEK); since.set(t, 0); }
    }
    if (s === season) {
      for (const al of [m.red, m.blue]) {
        if (al.teams.some((t) => !last.has(t))) continue; // newcomers have their own dynamics
        const exp = book.allianceExpectation(al.teams);
        const err = al.np - npOf(exp);
        const back = al.teams.filter((t) => since.has(t) && since.get(t)! < 12);
        if (!back.length) { add("no recent break", err); continue; }
        const g = Math.max(...back.map((t) => gapOf.get(t)!));
        const i = Math.min(...back.map((t) => since.get(t)!));
        const gk = g < 4 ? "2-4w" : g < 8 ? "4-8w" : "8w+";
        const ik = i === 0 ? "1st match" : i < 3 ? "2nd-3rd" : i < 6 ? "4th-6th" : "7th-12th";
        add(`break ${gk}, ${ik} back`, err);
      }
    }
    book.update(m);
    for (const t of [...m.red.teams, ...m.blue.teams]) {
      last.set(t, m.time);
      if (since.has(t)) since.set(t, since.get(t)! + 1);
    }
  }
}

console.log(`season ${season}: alliance non-penalty score error (actual − expected), ${tunedFile ?? "shipped settings"}`);
console.log("bucket".padEnd(32), "n".padStart(7), "bias".padStart(8), "MAE".padStart(8), "RMSE".padStart(8));
for (const [k, b] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(k.padEnd(32), String(b.n).padStart(7), (b.sum / b.n).toFixed(2).padStart(8), (b.abs / b.n).toFixed(2).padStart(8), Math.sqrt(b.sq / b.n).toFixed(2).padStart(8));
}
