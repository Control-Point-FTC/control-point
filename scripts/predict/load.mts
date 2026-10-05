// Predict research — load the raw FTC Scout cache into season-generic records
// (parser shared with the server: server/predict/scoutData.ts).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseScoutEventRecord } from "../../server/predict/scoutData.ts";
import type { EventRecord } from "../../server/predict/types.ts";

const ROOT = join(process.cwd(), ".cache", "predict", "scout");

export function loadSeason(season: number): EventRecord[] {
  const dir = join(ROOT, String(season));
  if (!existsSync(dir)) return [];
  const events: EventRecord[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const ev = parseScoutEventRecord(JSON.parse(readFileSync(join(dir, f), "utf8")), season);
    if (ev) events.push(ev);
  }
  events.sort((a, b) => a.startTime - b.startTime || a.code.localeCompare(b.code));
  return events;
}
