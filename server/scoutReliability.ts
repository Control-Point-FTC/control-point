// Reliability index from Control Scout (controlscout.org GET /api/reliability): a 0–100 estimate of how
// dependable a robot has been, from public qualification match results only (no-shows, DQs, estimated
// near-zero matches, swing, penalties, predictability). Control Scout computes and stores it; both apps show
// the same number, so it's read from there rather than worked out twice. Public data: no account, no
// workspace scouting ever travels in either direction.
//
// Cached per season and team for CACHE_MS; a failure (Scout down, slow, a bad answer) gives no number, never
// an error: pages show OPR as before.

export interface RecentRecord { matches: number; noShows: number; nearZero: number }
export interface TeamReliability {
  team: number;
  index: number;
  /** Qualification matches it rests on. */
  matches: number;
  noShows: number;
  dqs: number;
  nearZero: number;
  recent: RecentRecord;
}
export interface ReliabilityAnswer { season: number; fieldIndex: number | null; teams: TeamReliability[] }

export const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 4000;
const MAX_TEAMS = 100;

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** Scout's answer → the rows we pass on (only the fields named here; anything else is dropped). */
export function parseReliability(season: number, body: unknown): ReliabilityAnswer | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as any).teams)) return null;
  const teams: TeamReliability[] = [];
  for (const row of (body as any).teams) {
    const team = int(row?.team), r = row?.reliability;
    if (team == null || !r || typeof r !== "object") continue;
    const index = int(r.index), matches = int(r.matches);
    if (index == null || matches == null || index < 0 || index > 100) continue;
    teams.push({
      team, index, matches, noShows: int(r.noShows) ?? 0, dqs: int(r.dqs) ?? 0, nearZero: int(r.nearZero) ?? 0,
      recent: { matches: int(r.recent?.matches) ?? 0, noShows: int(r.recent?.noShows) ?? 0, nearZero: int(r.recent?.nearZero) ?? 0 },
    });
  }
  const fi = int((body as any).fieldIndex);
  return { season, fieldIndex: fi != null && fi >= 0 && fi <= 100 ? fi : null, teams };
}

export function createReliabilityClient(o: { origin: string; fetchImpl?: typeof fetch; now?: () => number }) {
  const fetchImpl = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const cache = new Map<string, { at: number; row: TeamReliability | null }>();
  const field = new Map<number, { at: number; value: number | null }>();
  return {
    /** The teams' reliability (those Scout has), in the order asked. Never throws. */
    async get(season: number, teams: number[]): Promise<ReliabilityAnswer> {
      const want = [...new Set(teams)].filter((t) => Number.isInteger(t) && t > 0 && t <= 999999).slice(0, MAX_TEAMS);
      const t = now();
      const missing = want.filter((x) => { const h = cache.get(`${season}:${x}`); return !h || t - h.at >= CACHE_MS; });
      if (missing.length) {
        try {
          const url = `${o.origin}/api/reliability?season=${season}&teams=${missing.join(",")}`;
          const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
          const parsed = res.ok ? parseReliability(season, await res.json()) : null;
          if (parsed) {
            const by = new Map(parsed.teams.map((r) => [r.team, r]));
            for (const x of missing) cache.set(`${season}:${x}`, { at: t, row: by.get(x) ?? null });
            field.set(season, { at: t, value: parsed.fieldIndex });
          }
        } catch { /* Scout unreachable: no numbers this time, asked again next time */ }
      }
      if (cache.size > 20_000) cache.clear();
      return {
        season, fieldIndex: field.get(season)?.value ?? null,
        teams: want.map((x) => cache.get(`${season}:${x}`)?.row).filter((r): r is TeamReliability => !!r),
      };
    },
  };
}
