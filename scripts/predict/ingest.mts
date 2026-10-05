// Predict research — Phase 1 data pull.
//
// Downloads every event with matches for the given seasons from FTC Scout
// into .cache/predict/scout/<season>/<code>.json (raw responses, resumable:
// existing files are skipped). Rate-limited — FTC Scout is a community API.
//
//   npx tsx scripts/predict/ingest.mts 2025 2024 2023 2022
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCOUT_EVENT_LIST_QUERY, scoutEventQuery } from "../../server/predict/scoutData.ts";

const API = "https://api.ftcscout.org/graphql";
const ROOT = join(process.cwd(), ".cache", "predict", "scout");
const CONCURRENCY = 3;
const MIN_GAP_MS = 150; // per worker, between requests


async function gql(query: string, variables: Record<string, unknown>, tries = 5): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.errors?.length && !body.data) throw new Error(JSON.stringify(body.errors).slice(0, 300));
      return body;
    } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ingestSeason(season: number) {
  const dir = join(ROOT, String(season));
  mkdirSync(dir, { recursive: true });
  const list = (await gql(SCOUT_EVENT_LIST_QUERY, { season })).data.eventsSearch as any[];
  writeFileSync(join(dir, "_events.json"), JSON.stringify(list));
  const todo = list.filter((e) => !existsSync(join(dir, `${e.code}.json`)));
  console.log(`[${season}] ${list.length} events with matches, ${todo.length} to fetch`);
  const q = scoutEventQuery(season);
  let done = 0, failed = 0;
  const worker = async () => {
    while (todo.length) {
      const ev = todo.shift()!;
      try {
        const body = await gql(q, { season, code: ev.code });
        writeFileSync(join(dir, `${ev.code}.json`), JSON.stringify(body));
      } catch (e) {
        failed++;
        console.warn(`[${season}] ${ev.code} failed: ${(e as Error).message}`);
      }
      done++;
      if (done % 100 === 0) console.log(`[${season}] ${done} fetched (${failed} failed)`);
      await sleep(MIN_GAP_MS);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[${season}] finished: ${done} fetched, ${failed} failed`);
}

const seasons = process.argv.slice(2).map(Number).filter(Boolean);
if (!seasons.length) { console.error("usage: ingest.mts <season...>"); process.exit(1); }
for (const s of seasons) await ingestSeason(s);
