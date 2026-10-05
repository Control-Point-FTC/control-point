/**
 * FIRST Events API client (https://ftc-events.firstinspires.org).
 *
 * This is the PRIMARY source of FTC competition data — official FIRST data
 * with the freshest event/team/match information. FTC Scout remains as a
 * fallback for data FIRST Events doesn't provide (notably OPR).
 *
 * Auth: HTTP Basic Auth. Credentials come ONLY from environment variables:
 *   FTC_EVENTS_USERNAME / FTC_EVENTS_TOKEN
 * Never log, return, or expose the credentials.
 *
 * Season format: 4-digit year the season STARTS.
 *   2025 = 2025-26 DECODE, 2026 = 2026-27 BIOBUZZ
 */

const BASE_URL = "https://ftc-events.firstinspires.org/v2.0";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1; // one retry on 5xx / timeout / network error only
const RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Config / auth
// ---------------------------------------------------------------------------

/** True when both FIRST Events credentials are present. */
export function isFirstEventsConfigured(): boolean {
  return Boolean(process.env.FTC_EVENTS_USERNAME && process.env.FTC_EVENTS_TOKEN);
}

function authHeader(): string {
  // Basic auth: base64(username:token). Built per-request so tests can
  // stub env vars without module reload.
  const user = process.env.FTC_EVENTS_USERNAME || "";
  const token = process.env.FTC_EVENTS_TOKEN || "";
  return "Basic " + Buffer.from(`${user}:${token}`).toString("base64");
}

/** Redact anything that looks like a credential from a message. */
export function redactSecrets(msg: string): string {
  let out = String(msg || "");
  const token = process.env.FTC_EVENTS_TOKEN;
  const user = process.env.FTC_EVENTS_USERNAME;
  if (token && token.length >= 4) out = out.split(token).join("[redacted]");
  if (user && user.length >= 2) out = out.split(user).join("[redacted]");
  // Also scrub anything that looks like `Basic <base64>` just in case.
  out = out.replace(/Basic [A-Za-z0-9+/=]{8,}/g, "Basic [redacted]");
  return out;
}

function logError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ftc-events] ${context}: ${redactSecrets(msg)}`);
}

// ---------------------------------------------------------------------------
// Typed response shapes (validated before use)
// ---------------------------------------------------------------------------

export interface FirstTeam {
  teamNumber: number;
  name: string;
  schoolName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  rookieYear: number | null;
  sponsors: string[];
}

export interface FirstTeamEvent {
  eventCode: string;
  name: string;
  eventType: string | null;
  dateStart: string | null;
  dateEnd: string | null;
}

export interface FirstEvent {
  eventCode: string;
  name: string;
  eventType: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  timezone: string | null;
}

export interface FirstRanking {
  teamNumber: number;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  qualAverage: number | null;
  rankingPoints: number | null;
}

export interface FirstMatchTeam {
  number: number;
}

export interface FirstMatch {
  matchNumber: number;
  level: "qual" | "playoff";
  series: number | null;
  description: string | null;
  red: { teams: number[]; score: number | null };
  blue: { teams: number[]; score: number | null };
}

export interface FirstAlliance {
  number: number;
  captain: number | null;
  pick1: number | null;
  pick2: number | null;
  backup: number | null;
  name: string | null;
}

// ---------------------------------------------------------------------------
// Validation helpers — never trust the wire
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function dateOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  // FIRST returns ISO datetimes; normalize to YYYY-MM-DD.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function validateTeam(raw: unknown): FirstTeam | null {
  if (!isObj(raw)) return null;
  const teamNumber = num(raw.teamNumber);
  if (!teamNumber) return null;
  const sponsorsRaw = Array.isArray(raw.sponsors) ? raw.sponsors : [];
  return {
    teamNumber,
    name: str(raw.nameFull) || str(raw.nameShort) || `Team ${teamNumber}`,
    schoolName: str(raw.schoolName),
    city: str(raw.city),
    state: str(raw.stateProv),
    country: str(raw.country),
    rookieYear: num(raw.rookieYear),
    sponsors: sponsorsRaw.filter((s): s is string => typeof s === "string" && s.length > 0),
  };
}

function validateTeamEvent(raw: unknown): FirstTeamEvent | null {
  if (!isObj(raw)) return null;
  const eventCode = str(raw.eventCode);
  if (!eventCode) return null;
  return {
    eventCode,
    name: str(raw.name) || eventCode,
    eventType: str(raw.eventType),
    dateStart: dateOnly(raw.dateStart),
    dateEnd: dateOnly(raw.dateEnd),
  };
}

function validateEvent(raw: unknown): FirstEvent | null {
  if (!isObj(raw)) return null;
  const eventCode = str(raw.eventCode);
  if (!eventCode) return null;
  return {
    eventCode,
    name: str(raw.name) || eventCode,
    eventType: str(raw.eventType),
    venue: str(raw.venue),
    address: str(raw.address),
    city: str(raw.city),
    state: str(raw.stateProv),
    country: str(raw.country),
    dateStart: dateOnly(raw.dateStart),
    dateEnd: dateOnly(raw.dateEnd),
    timezone: str(raw.timezone),
  };
}

function validateRanking(raw: unknown): FirstRanking | null {
  if (!isObj(raw)) return null;
  const teamNumber = num(raw.teamNumber);
  if (!teamNumber) return null;
  return {
    teamNumber,
    rank: num(raw.rank),
    wins: num(raw.wins),
    losses: num(raw.losses),
    ties: num(raw.ties),
    qualAverage: num(raw.qualAverage),
    // FIRST uses sortOrder1.. for ranking points depending on season; try a few.
    rankingPoints: num(raw.rankingPoints) ?? num(raw.sortOrder1),
  };
}

function validateMatch(raw: unknown): FirstMatch | null {
  if (!isObj(raw)) return null;
  const matchNumber = num(raw.matchNumber);
  if (!matchNumber) return null;
  const levelRaw = strOrEmpty(raw.tournamentLevel).toLowerCase();
  const level: "qual" | "playoff" = levelRaw.includes("playoff") ? "playoff" : "qual";
  const side = (s: unknown): { teams: number[]; score: number | null } => {
    if (!isObj(s)) return { teams: [], score: null };
    const teams: number[] = [];
    for (const k of ["team1", "team2", "team3"]) {
      const n = num(s[k]);
      if (n) teams.push(n);
    }
    return { teams, score: num(s.score) ?? num(s.totalPoints) };
  };
  return {
    matchNumber,
    level,
    series: num(raw.series),
    description: str(raw.description),
    red: side(raw.red),
    blue: side(raw.blue),
  };
}

function validateAlliance(raw: unknown): FirstAlliance | null {
  if (!isObj(raw)) return null;
  const number = num(raw.number ?? raw.allianceNumber);
  if (!number) return null;
  return {
    number,
    captain: num(raw.captain),
    pick1: num(raw.pick1),
    pick2: num(raw.pick2),
    backup: num(raw.backup),
    name: str(raw.name),
  };
}

// ---------------------------------------------------------------------------
// Core fetch with timeout, retry, 429 backoff — never logs credentials
// ---------------------------------------------------------------------------

export class FirstEventsError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.name = "FirstEventsError";
    this.status = status;
    this.retryable = retryable;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function firstEventsFetch(path: string): Promise<unknown> {
  if (!isFirstEventsConfigured()) {
    throw new FirstEventsError("FIRST Events API not configured", 0, false);
  }
  const url = `${BASE_URL}${path}`;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: authHeader(),
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        // Rate limited — respect Retry-After, then backoff once.
        const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
        const waitMs = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000, 30_000);
        logError("rate limited (429)", `path=${path} waiting ${waitMs}ms`);
        await sleep(waitMs);
        // One more attempt after the wait (does not count as the retry).
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new FirstEventsError("FIRST Events auth rejected (check credentials)", res.status, false);
      }
      if (res.status === 404) {
        throw new FirstEventsError("not found", 404, false);
      }
      if (res.status >= 500) {
        lastErr = new FirstEventsError(`upstream ${res.status}`, res.status, true);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        throw new FirstEventsError(`unexpected status ${res.status}`, res.status, false);
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new FirstEventsError("invalid JSON response", res.status, false);
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof FirstEventsError) {
        if (err.retryable && attempt < MAX_RETRIES) {
          lastErr = err;
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }
      // Network error / timeout (AbortError)
      const isTimeout = err instanceof Error && err.name === "AbortError";
      lastErr = new FirstEventsError(isTimeout ? "request timed out" : "network error", 0, true);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr instanceof Error ? lastErr : new FirstEventsError("request failed", 0, false);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Team details for a season. Returns null on 404. */
export async function getFirstEventsTeam(season: number, teamNumber: number): Promise<FirstTeam | null> {
  try {
    const data = await firstEventsFetch(`/${season}/teams?teamNumber=${teamNumber}`);
    const teams = isObj(data) && Array.isArray(data.teams) ? data.teams : [];
    for (const t of teams) {
      const v = validateTeam(t);
      if (v && v.teamNumber === teamNumber) return v;
    }
    return validateTeam(teams[0]) ?? null;
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return null;
    throw err;
  }
}

/** Events a team is registered for in a season. */
export async function getFirstEventsTeamEvents(season: number, teamNumber: number): Promise<FirstTeamEvent[]> {
  const data = await firstEventsFetch(`/${season}/teams/${teamNumber}/events`);
  const events = isObj(data) && Array.isArray(data.events) ? data.events : [];
  const seen = new Set<string>();
  const out: FirstTeamEvent[] = [];
  for (const e of events) {
    const v = validateTeamEvent(e);
    const key = v?.eventCode.toLowerCase();
    if (v && key && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out.sort((a, b) => (a.dateStart || "").localeCompare(b.dateStart || ""));
}

/** Single event details. Returns null on 404. */
export async function getFirstEventsEvent(season: number, eventCode: string): Promise<FirstEvent | null> {
  try {
    const data = await firstEventsFetch(`/${season}/events?eventCode=${encodeURIComponent(eventCode)}`);
    const events = isObj(data) && Array.isArray(data.events) ? data.events : [];
    for (const e of events) {
      const v = validateEvent(e);
      if (v && v.eventCode.toLowerCase() === eventCode.toLowerCase()) return v;
    }
    return validateEvent(events[0]) ?? null;
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return null;
    throw err;
  }
}

/** Teams registered at an event (deduped by team number). */
export async function getFirstEventsEventTeams(
  season: number,
  eventCode: string
): Promise<{ teamNumber: number; name: string }[]> {
  const data = await firstEventsFetch(`/${season}/events/${encodeURIComponent(eventCode)}/teams`);
  const teams = isObj(data) && Array.isArray(data.teams) ? data.teams : [];
  const seen = new Set<number>();
  const out: { teamNumber: number; name: string }[] = [];
  for (const t of teams) {
    const v = validateTeam(t);
    if (v && !seen.has(v.teamNumber)) {
      seen.add(v.teamNumber);
      out.push({ teamNumber: v.teamNumber, name: v.name });
    }
  }
  return out.sort((a, b) => a.teamNumber - b.teamNumber);
}

/** Rankings at an event. Returns [] when the event hasn't published rankings yet. */
export async function getFirstEventsRankings(season: number, eventCode: string): Promise<FirstRanking[]> {
  try {
    const data = await firstEventsFetch(`/${season}/events/${encodeURIComponent(eventCode)}/rankings`);
    const rankings = isObj(data) && Array.isArray(data.rankings) ? data.rankings : [];
    const seen = new Set<number>();
    const out: FirstRanking[] = [];
    for (const r of rankings) {
      const v = validateRanking(r);
      if (v && !seen.has(v.teamNumber)) {
        seen.add(v.teamNumber);
        out.push(v);
      }
    }
    return out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}

/** Match schedule (quals or playoffs). Returns [] when not published yet. */
export async function getFirstEventsSchedule(
  season: number,
  eventCode: string,
  level: "qual" | "playoff"
): Promise<FirstMatch[]> {
  try {
    const data = await firstEventsFetch(
      `/${season}/events/${encodeURIComponent(eventCode)}/schedule/${level}`
    );
    const matches = isObj(data) && Array.isArray(data.matches) ? data.matches : [];
    const seen = new Set<number>();
    const out: FirstMatch[] = [];
    for (const m of matches) {
      const v = validateMatch(m);
      if (v && !seen.has(v.matchNumber)) {
        seen.add(v.matchNumber);
        out.push(v);
      }
    }
    return out.sort((a, b) => a.matchNumber - b.matchNumber);
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}

/** Match results (scores). Returns [] when no results yet. */
export async function getFirstEventsMatches(season: number, eventCode: string): Promise<FirstMatch[]> {
  try {
    const data = await firstEventsFetch(`/${season}/events/${encodeURIComponent(eventCode)}/matches`);
    const matches = isObj(data) && Array.isArray(data.matches) ? data.matches : [];
    const seen = new Set<string>();
    const out: FirstMatch[] = [];
    for (const m of matches) {
      const v = validateMatch(m);
      if (!v) continue;
      const key = `${v.level}:${v.matchNumber}:${v.series ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out.sort((a, b) => (a.level === b.level ? a.matchNumber - b.matchNumber : a.level === "qual" ? -1 : 1));
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}

/** Playoff alliances. Returns [] when not formed yet. */
export async function getFirstEventsAlliances(season: number, eventCode: string): Promise<FirstAlliance[]> {
  try {
    const data = await firstEventsFetch(`/${season}/events/${encodeURIComponent(eventCode)}/alliances`);
    const alliances = isObj(data) && Array.isArray(data.alliances) ? data.alliances : [];
    const seen = new Set<number>();
    const out: FirstAlliance[] = [];
    for (const a of alliances) {
      const v = validateAlliance(a);
      if (v && !seen.has(v.number)) {
        seen.add(v.number);
        out.push(v);
      }
    }
    return out.sort((a, b) => a.number - b.number);
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}
