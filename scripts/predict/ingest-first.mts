// Predict research — official advancement data from the FIRST Events API.
//
// For every event that sends teams onward (league tournaments, qualifiers,
// championships, super-qualifiers, premier events) in the given seasons:
//   advancement/{code}          slots + who advanced and why
//   advancement/{code}/points   2025+ points breakdown per team
//   alliances/{code}            final alliance selections
// Saved to .cache/predict/first/<season>/<code>.json. Resumable.
// Credentials come from FTC_EVENTS_USERNAME / FTC_EVENTS_TOKEN (never logged).
//
//   npx tsx scripts/predict/ingest-first.mts 2025 2024
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://ftc-api.firstinspires.org/v2.0";
const ROOT = join(process.cwd(), ".cache", "predict");
const ADVANCING_TYPES = new Set(["LeagueTournament", "Qualifier", "Championship", "SuperQualifier", "Premier", "FIRSTChampionship"]);
const CONCURRENCY = 2;

const user = process.env.FTC_EVENTS_USERNAME, token = process.env.FTC_EVENTS_TOKEN;
if (!user || !token) { console.error("Set FTC_EVENTS_USERNAME and FTC_EVENTS_TOKEN"); process.exit(1); }
const auth = "Basic " + Buffer.from(`${user}:${token}`).toString("base64");

async function get(path: string, tries = 4): Promise<{ status: number; body: unknown }> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: auth, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let body: unknown = null;
      try { body = JSON.parse(text); } catch { body = null; }
      return { status: res.status, body };
    } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
}

async function ingest(season: number) {
  const list = JSON.parse(readFileSync(join(ROOT, "scout", String(season), "_events.json"), "utf8")) as any[];
  const dir = join(ROOT, "first", String(season));
  mkdirSync(dir, { recursive: true });
  const todo = list.filter((e) => ADVANCING_TYPES.has(e.type) && !e.remote && !existsSync(join(dir, `${e.code}.json`)));
  console.log(`[${season}] ${todo.length} advancing events to fetch`);
  let done = 0, failed = 0;
  const worker = async () => {
    while (todo.length) {
      const ev = todo.shift()!;
      try {
        const adv = await get(`${season}/advancement/${ev.code}`);
        const pts = season >= 2025 ? await get(`${season}/advancement/${ev.code}/points`) : null;
        const al = await get(`${season}/alliances/${ev.code}`);
        writeFileSync(join(dir, `${ev.code}.json`), JSON.stringify({
          code: ev.code, type: ev.type,
          advancement: adv.status === 200 ? adv.body : null,
          points: pts && pts.status === 200 ? pts.body : null,
          alliances: al.status === 200 ? al.body : null,
        }));
      } catch (e) {
        failed++;
        console.warn(`[${season}] ${ev.code} failed: ${(e as Error).message}`);
      }
      if (++done % 100 === 0) console.log(`[${season}] ${done} done (${failed} failed)`);
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[${season}] finished: ${done} done, ${failed} failed`);
}

for (const s of process.argv.slice(2).map(Number).filter(Boolean)) await ingest(s);
