// Offline region pack builder (V3.5 phase 6b). Turns the Predict store's raw
// FTC Scout event files into the compact OfflinePack the browser keeps.
// Files are re-packed only when they change, so a rebuild after a sync only
// touches the events that sync downloaded.
import { OFFLINE_PACK_FORMAT, type OfflinePack, type OfflineRegion, type OfflineRegions, type PackEntry, type PackEvent, type PackMatch, type PackScore, type PackTeam } from "../../src/types/offlinePack.js";
import { regionName } from "./regions.js";

export interface PackSource {
  hasSeason(season: number): boolean;
  eventFiles(season: number): { code: string; path: string; mtimeMs: number }[];
  readEventFile(path: string): any;
  lastSync(season: number): string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Endgame field per season (same as server/predict/scoutData.ts). */
function endgameOf(season: number, a: any): number {
  if (season >= 2025) return a.dcBasePoints ?? 0;
  if (season === 2024) return a.dcParkPoints ?? 0;
  return a.egPoints ?? 0;
}

function score(season: number, a: any): PackScore | null {
  if (!a || typeof a.totalPointsNp !== "number") return null;
  const auto = a.autoPoints ?? 0, endgame = endgameOf(season, a);
  // 2024+: dcPoints include the endgame; earlier seasons they don't.
  const teleop = season >= 2024 ? (a.dcPoints ?? 0) - endgame : a.dcPoints ?? 0;
  return [a.totalPoints ?? a.totalPointsNp, a.totalPointsNp, auto, teleop, endgame, a.penaltyPointsCommitted ?? 0];
}

export interface PackedEvent { event: PackEvent; names: Map<number, PackTeam> }

/** One stored FTC Scout event → its pack entry (null for remote events or bad files). */
export function packEvent(raw: any, season: number): PackedEvent | null {
  const ev = raw?.data?.eventByCode;
  if (!ev?.code || ev.remote || ev.hybrid) return null;
  const names = new Map<number, PackTeam>();
  const teams: PackEntry[] = [];
  for (const t of Array.isArray(ev.teams) ? ev.teams : []) {
    const n = num(t?.teamNumber);
    if (!n) continue;
    const s = t.stats ?? {};
    teams.push([n, num(s.rank), num(s.rp), num(s.wins), num(s.losses), num(s.ties), num(s.qualMatchesPlayed)]);
    const name = str(t.team?.name);
    if (name) names.set(n, [n, name, str(t.team?.location?.city), str(t.team?.location?.state)]);
  }
  const matches: PackMatch[] = [];
  for (const m of Array.isArray(ev.matches) ? ev.matches : []) {
    const side = (al: string) => (m.teams ?? []).filter((t: any) => t.alliance === al && t.onField !== false).map((t: any) => t.teamNumber as number);
    const r = side("Red"), b = side("Blue");
    if (!r.length && !b.length) continue;
    const played = !!m.hasBeenPlayed && !!m.scores;
    const pm: PackMatch = {
      l: String(m.tournamentLevel || "").toLowerCase().startsWith("qual") ? "q" : "p",
      s: num(m.series) ?? 0,
      n: num(m.matchNum) ?? 0,
      t: str(m.actualStartTime) ?? str(m.scheduledStartTime),
      r, b,
      rs: played ? score(season, m.scores.red) : null,
      bs: played ? score(season, m.scores.blue) : null,
    };
    const sur = (m.teams ?? []).filter((t: any) => t.surrogate && t.onField !== false).map((t: any) => t.teamNumber as number);
    if (sur.length) pm.sur = sur;
    const dq = (m.teams ?? []).filter((t: any) => t.dq && t.onField !== false).map((t: any) => t.teamNumber as number);
    if (dq.length) pm.dq = dq;
    matches.push(pm);
  }
  matches.sort((x, y) => (x.l === y.l ? 0 : x.l === "q" ? -1 : 1) || x.s - y.s || x.n - y.n);
  return {
    event: {
      code: ev.code, name: str(ev.name) ?? ev.code, type: str(ev.type), start: str(ev.start), end: str(ev.end) ?? str(ev.start),
      region: str(ev.regionCode), state: str(ev.location?.state), country: str(ev.location?.country),
      teams,
      awards: (Array.isArray(ev.awards) ? ev.awards : []).filter((a: any) => num(a?.teamNumber) && str(a?.type)).map((a: any) => [a.type, num(a.placement) ?? 1, a.teamNumber] as [string, number, number]),
      matches,
    },
    names,
  };
}

/** FNV-1a: a short, stable fingerprint of the file list (not security sensitive). */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${s.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

/** A season's packed events, and a version that changes whenever any stored event file does. */
export interface PackedSeason { events: PackedEvent[]; version: string }

export class OfflinePackBuilder {
  private packed = new Map<number, Map<string, { mtimeMs: number; ev: PackedEvent | null }>>();
  private refreshing = new Map<number, Promise<PackedSeason>>();

  constructor(private src: PackSource) {}

  /** Every event of a season, re-packing only files that changed (one refresh at a time). */
  events(season: number): Promise<PackedSeason> {
    const running = this.refreshing.get(season);
    if (running) return running;
    const p = this.refresh(season).finally(() => this.refreshing.delete(season));
    this.refreshing.set(season, p);
    return p;
  }

  private async refresh(season: number): Promise<PackedSeason> {
    if (!this.src.hasSeason(season)) return { events: [], version: "" };
    const cache = this.packed.get(season) ?? new Map();
    const seen = new Set<string>();
    const files = this.src.eventFiles(season);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      seen.add(f.code);
      const hit = cache.get(f.code);
      if (!hit || hit.mtimeMs !== f.mtimeMs) cache.set(f.code, { mtimeMs: f.mtimeMs, ev: packEvent(this.src.readEventFile(f.path), season) });
      if (i % 25 === 24) await yieldLoop();
    }
    for (const code of [...cache.keys()]) if (!seen.has(code)) cache.delete(code);
    this.packed.set(season, cache);
    // Read in the same pass as the events, so a pack built from them always
    // matches its version (no sync can slip between the two).
    const version = files.map((f) => `${f.code}@${f.mtimeMs}`).sort().join(",");
    return { events: [...cache.values()].map((x) => x.ev).filter((x): x is PackedEvent => !!x), version: shortHash(version) };
  }
}

/** Region of a team: where most of its events were. */
export function detectRegion(events: { region: string | null; teams: number[] }[], team: number | null): string | null {
  if (!team) return null;
  const count = new Map<string, number>();
  for (const e of events) if (e.region && e.teams.includes(team)) count.set(e.region, (count.get(e.region) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function listRegions(events: PackedEvent[], season: number, dataAsOf: string | null, detectedCode: string | null): OfflineRegions {
  const by = new Map<string, { events: number; teams: Set<number> }>();
  const allTeams = new Set<number>();
  for (const { event } of events) {
    const teams = event.teams.map((t) => t[0]);
    teams.forEach((t) => allTeams.add(t));
    if (!event.region) continue;
    const r = by.get(event.region) ?? { events: 0, teams: new Set<number>() };
    r.events++;
    teams.forEach((t) => r.teams.add(t));
    by.set(event.region, r);
  }
  const regions: OfflineRegion[] = [...by.entries()].map(([code, r]) => ({ code, name: regionName(code), events: r.events, teams: r.teams.size })).sort((a, b) => a.name.localeCompare(b.name));
  return { season, dataAsOf, detected: regions.find((r) => r.code === detectedCode) ?? null, regions, all: { events: events.length, teams: allTeams.size } };
}

/** The pack for one region ("ALL" = every event of the season). */
export function buildPack(events: PackedEvent[], season: number, region: string, dataAsOf: string | null, now = new Date()): OfflinePack {
  const chosen = region === "ALL" ? events : events.filter((e) => e.event.region === region);
  const names = new Map<number, PackTeam>();
  // Names from every event (a visiting team's name may only be in its home events).
  for (const e of events) for (const [n, t] of e.names) if (!names.has(n)) names.set(n, t);
  const teamNums = new Set<number>();
  for (const { event } of chosen) for (const t of event.teams) teamNums.add(t[0]);
  const teams: PackTeam[] = [...teamNums].sort((a, b) => a - b).map((n) => names.get(n) ?? [n, `Team ${n}`, null, null]);
  return {
    format: OFFLINE_PACK_FORMAT,
    region, regionName: region === "ALL" ? "All regions" : regionName(region),
    season, builtAt: now.toISOString(), dataAsOf,
    teams,
    events: chosen.map((e) => e.event).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || a.code.localeCompare(b.code)),
  };
}
