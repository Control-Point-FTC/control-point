// Predict — on-disk store of match history for the live engine.
//
// Raw FTC Scout event responses (same format as the research cache) and
// FIRST advancement lists, under PREDICT_DATA_DIR (default <cwd>/.data/predict).
// Sync is incremental: FTC Scout's event list carries `updatedAt`, so only
// events that changed since the last sync are re-downloaded. Requests are
// sequential and spaced out — FTC Scout is a community API.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ADVANCING_TYPES, SCOUT_EVENT_LIST_QUERY, parseScoutEventRecord, scoutEventQuery } from "./scoutData.js";
import type { EventRecord } from "./types.js";
import type { FirstAdvancement } from "../ftcEvents.js";

export interface EventMeta { code: string; type: string; start: string | null; end: string | null; region: string | null; updatedAt: string | null; remote?: boolean }

export interface StoreDeps {
  /** POST a GraphQL query to FTC Scout. */
  scout: (query: string, variables: Record<string, unknown>) => Promise<any>;
  /** FIRST advancement for an event (null = not published). */
  advancement: (season: number, code: string) => Promise<FirstAdvancement | null>;
  /** Pause between requests (ms). */
  gapMs?: number;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PredictStore {
  constructor(readonly dir: string, private deps: StoreDeps) {}

  private seasonDir(kind: "scout" | "first", season: number): string {
    const d = join(this.dir, kind, String(season));
    mkdirSync(d, { recursive: true });
    return d;
  }

  private readJson<T>(file: string, fallback: T): T {
    try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return fallback; }
  }

  /** Event list as of the last sync. */
  index(season: number): Record<string, EventMeta> {
    return this.readJson(join(this.seasonDir("scout", season), "_index.json"), {} as Record<string, EventMeta>);
  }

  /** True once a season has been downloaded at least once. */
  hasSeason(season: number): boolean {
    return existsSync(join(this.seasonDir("scout", season), "_index.json"));
  }

  /** True once a sync of the season finished with every event downloaded. */
  isComplete(season: number): boolean {
    return this.readJson(join(this.seasonDir("scout", season), "_status.json"), { complete: false }).complete === true;
  }

  /** When the season's event list was last downloaded (null = never). */
  lastSync(season: number): string | null {
    const at = this.readJson<{ lastSync?: unknown }>(join(this.seasonDir("scout", season), "_status.json"), {}).lastSync;
    return typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : null;
  }

  /**
   * Download events that are new or changed since the last sync.
   * Returns how many were fetched.
   */
  async syncScout(season: number): Promise<number> {
    const dir = this.seasonDir("scout", season);
    // Never act on an error response: a GraphQL error (HTTP 200) must not
    // wipe the index or overwrite good event files.
    const listResp = await this.deps.scout(SCOUT_EVENT_LIST_QUERY, { season });
    const list = listResp?.data?.eventsSearch;
    if (!Array.isArray(list) || listResp?.errors?.length) throw new Error(`event list unavailable${listResp?.errors?.length ? `: ${JSON.stringify(listResp.errors).slice(0, 200)}` : ""}`);
    const old = this.index(season);
    const next: Record<string, EventMeta> = {};
    const todo: EventMeta[] = [];
    for (const e of list) {
      const meta: EventMeta = { code: e.code, type: e.type, start: e.start ?? null, end: e.end ?? null, region: e.regionCode ?? null, updatedAt: e.updatedAt ?? null, remote: !!(e.remote || e.hybrid) };
      next[e.code] = old[e.code] && old[e.code].updatedAt === meta.updatedAt && existsSync(join(dir, `${e.code}.json`)) ? old[e.code] : meta;
      if (next[e.code] === meta && !meta.remote) todo.push(meta);
    }
    let fetched = 0, failed = 0;
    const q = scoutEventQuery(season);
    for (const e of todo) {
      try {
        const body = await this.deps.scout(q, { season, code: e.code });
        if (body?.errors?.length || !body?.data?.eventByCode) throw new Error(body?.errors?.length ? JSON.stringify(body.errors).slice(0, 200) : "no event in response");
        writeFileSync(join(dir, `${e.code}.json`), JSON.stringify(body));
        fetched++;
      } catch (err) {
        failed++;
        // Keep the old index entry (or none) so it's retried next sync.
        if (old[e.code]) next[e.code] = old[e.code]; else delete next[e.code];
        this.deps.log?.(`[predict] ${season} ${e.code} fetch failed: ${(err as Error).message}`);
      }
      if (fetched && fetched % 100 === 0) this.deps.log?.(`[predict] ${season}: ${fetched}/${todo.length} events synced`);
      await sleep(this.deps.gapMs ?? 150);
    }
    writeFileSync(join(dir, "_index.json"), JSON.stringify(next));
    // Only a sync with no failures marks the season complete (older seasons
    // stop syncing once complete; unfinished ones keep retrying).
    writeFileSync(join(dir, "_status.json"), JSON.stringify({ complete: failed === 0, lastSync: new Date().toISOString(), failed }));
    return fetched;
  }

  /**
   * Fetch FIRST advancement for finished advancing events we don't have yet,
   * and refresh recent ones (lists can change for a few days after an event).
   * A missing result (not published yet, credentials absent, request failed)
   * is never final: it's retried at most once a day.
   */
  async syncAdvancement(season: number, now = Date.now()): Promise<number> {
    const dir = this.seasonDir("first", season);
    let fetched = 0;
    for (const e of Object.values(this.index(season))) {
      if (!ADVANCING_TYPES.has(e.type) || e.remote || !e.end) continue;
      const end = Date.parse(`${e.end}T23:59:59Z`);
      if (end > now) continue;
      const file = join(dir, `${e.code}.json`);
      const recent = now - end < 7 * 864e5;
      const saved = existsSync(file) ? this.readJson<{ advancement: unknown; fetchedAt?: string } | null>(file, null) : null;
      if (saved?.advancement && !recent) continue;
      if (saved && !saved.advancement && saved.fetchedAt && now - Date.parse(saved.fetchedAt) < 864e5) continue;
      try {
        const adv = await this.deps.advancement(season, e.code);
        writeFileSync(file, JSON.stringify({ code: e.code, type: e.type, region: e.region, end: e.end, advancement: adv, fetchedAt: new Date(now).toISOString() }));
        fetched++;
      } catch (err) {
        this.deps.log?.(`[predict] advancement ${season} ${e.code} failed: ${(err as Error).message}`);
      }
      await sleep(this.deps.gapMs ?? 150);
    }
    return fetched;
  }

  /** Event files of a season with their modification times (for incremental re-parsing). */
  eventFiles(season: number): { code: string; path: string; mtimeMs: number }[] {
    const dir = this.seasonDir("scout", season);
    return readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => {
      const path = join(dir, f);
      return { code: f.slice(0, -5), path, mtimeMs: statSync(path).mtimeMs };
    });
  }

  /** Parse one stored event file (null when not an official in-person event with matches). */
  parseEventFile(path: string, season: number): EventRecord | null {
    return parseScoutEventRecord(this.readJson(path, null), season);
  }

  /** Parsed events of a season (official, in person, with played matches). */
  loadEvents(season: number): EventRecord[] {
    const dir = this.seasonDir("scout", season);
    const out: EventRecord[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const ev = parseScoutEventRecord(this.readJson(join(dir, f), null), season);
      if (ev) out.push(ev);
    }
    return out.sort((a, b) => a.startTime - b.startTime || a.code.localeCompare(b.code));
  }

  /** Stored FIRST advancement records of a season. */
  loadAdvancement(season: number): { code: string; type: string; region: string | null; end: string; advancement: FirstAdvancement | null }[] {
    const dir = this.seasonDir("first", season);
    return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => this.readJson(join(dir, f), null)).filter(Boolean) as any[];
  }
}
