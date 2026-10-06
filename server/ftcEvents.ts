/**
 * FIRST Events API client (https://ftc-api.firstinspires.org; docs at
 * https://ftc-events.firstinspires.org/api-docs).
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

// The API host itself. ftc-events.firstinspires.org/v2.0 only redirects here,
// and the Authorization header does not survive that cross-host redirect.
const BASE_URL = "https://ftc-api.firstinspires.org/v2.0";
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

export interface FirstAllianceResult {
  teams: number[];
  /** Final score (null until played / on schedule entries). */
  score: number | null;
  /** Auto points (results only). */
  auto?: number | null;
  /** Penalty points this alliance committed, i.e. awarded to the opponent (results only). */
  foul?: number | null;
}

export interface FirstMatch {
  matchNumber: number;
  level: "qual" | "playoff";
  series: number | null;
  description: string | null;
  /** Actual start time (results) or scheduled start (schedule). */
  time?: string | null;
  red: FirstAllianceResult;
  blue: FirstAllianceResult;
}

export interface FirstAlliance {
  number: number;
  captain: number | null;
  pick1: number | null;
  pick2: number | null;
  pick3: number | null;
  backup: number | null;
  name: string | null;
}

// ---------------------------------------------------------------------------
// Validation helpers — never trust the wire. Field names follow the official
// FTC Events API v2.0 OpenAPI contract (ftc-api.firstinspires.org/swagger).
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function dateOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  // FIRST returns ISO datetimes; normalize to YYYY-MM-DD.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Stable key for a match: playoff match numbers repeat across series. */
export function matchKey(m: { level: string; series: number | null; matchNumber: number }): string {
  return `${m.level}:${m.series ?? 0}:${m.matchNumber}`;
}

// SeasonTeamModel_Version2: nameShort is the team name; nameFull is the
// official "Sponsor/Sponsor&School" string, which we split into sponsors.
function validateTeam(raw: unknown): FirstTeam | null {
  if (!isObj(raw)) return null;
  const teamNumber = num(raw.teamNumber);
  if (!teamNumber) return null;
  const full = str(raw.nameFull);
  const sponsors = full
    ? full.split(/[\/&]/).map((x) => x.trim()).filter((x) => x.length > 0 && x.length < 120)
    : [];
  return {
    teamNumber,
    name: str(raw.nameShort) || `Team ${teamNumber}`,
    schoolName: str(raw.schoolName),
    city: str(raw.city),
    state: str(raw.stateProv),
    country: str(raw.country),
    rookieYear: num(raw.rookieYear),
    sponsors,
  };
}

// SeasonEventModel_Version2: `code`, `typeName`/`type`, lowercase-p `stateprov`.
function validateEvent(raw: unknown): FirstEvent | null {
  if (!isObj(raw)) return null;
  const eventCode = str(raw.code);
  if (!eventCode) return null;
  return {
    eventCode,
    name: str(raw.name) || eventCode,
    eventType: str(raw.typeName) || str(raw.type),
    venue: str(raw.venue),
    address: str(raw.address),
    city: str(raw.city),
    state: str(raw.stateprov),
    country: str(raw.country),
    dateStart: dateOnly(raw.dateStart),
    dateEnd: dateOnly(raw.dateEnd),
    timezone: str(raw.timezone),
  };
}

function validateTeamEvent(raw: unknown): FirstTeamEvent | null {
  const e = validateEvent(raw);
  return e ? { eventCode: e.eventCode, name: e.name, eventType: e.eventType, dateStart: e.dateStart, dateEnd: e.dateEnd } : null;
}

// TeamRankingModel. sortOrder1 is the season's primary ranking value.
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
    rankingPoints: num(raw.sortOrder1),
  };
}

// ScheduledMatchModel_Version2 / MatchResultModel_Version2: alliances come as
// a `teams` array whose `station` is "Red1".."Blue3"; final scores are the
// top-level scoreRedFinal / scoreBlueFinal (absent on schedule entries).
function validateMatch(raw: unknown): FirstMatch | null {
  if (!isObj(raw)) return null;
  const matchNumber = num(raw.matchNumber);
  if (!matchNumber) return null;
  const levelRaw = (str(raw.tournamentLevel) || "").toLowerCase();
  const level: "qual" | "playoff" = levelRaw.startsWith("qual") ? "qual" : "playoff";
  const red: number[] = [];
  const blue: number[] = [];
  const teams = Array.isArray(raw.teams) ? raw.teams : [];
  const ordered = [...teams].sort((a: any, b: any) => String(a?.station).localeCompare(String(b?.station)));
  for (const t of ordered) {
    if (!isObj(t)) continue;
    const n = num(t.teamNumber);
    const station = (str(t.station) || "").toLowerCase();
    if (!n) continue;
    if (station.startsWith("red")) red.push(n);
    else if (station.startsWith("blue")) blue.push(n);
  }
  return {
    matchNumber,
    level,
    series: num(raw.series),
    description: str(raw.description),
    time: str(raw.actualStartTime) || str(raw.startTime),
    red: { teams: red, score: num(raw.scoreRedFinal), auto: num(raw.scoreRedAuto), foul: num(raw.scoreRedFoul) },
    blue: { teams: blue, score: num(raw.scoreBlueFinal), auto: num(raw.scoreBlueAuto), foul: num(raw.scoreBlueFoul) },
  };
}

// AllianceModel_Version2: captain/round1/round2/round3/backup are AllianceTeam
// objects ({ teamNumber, ... }) or null.
function allianceTeam(v: unknown): number | null {
  return isObj(v) ? num(v.teamNumber) : null;
}
function validateAlliance(raw: unknown): FirstAlliance | null {
  if (!isObj(raw)) return null;
  const number = num(raw.number);
  if (!number) return null;
  return {
    number,
    captain: allianceTeam(raw.captain),
    pick1: allianceTeam(raw.round1),
    pick2: allianceTeam(raw.round2),
    pick3: allianceTeam(raw.round3),
    backup: allianceTeam(raw.backup),
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
  let rateLimitWaits = 0; // a 429 wait never consumes the error retry

  for (let attempt = 0; attempt <= MAX_RETRIES; ) {
    const ctrl = new AbortController();
    // The timeout covers headers AND body: it is cleared only once the body
    // has been read (or the attempt failed), in the finally below.
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader(), Accept: "application/json" },
        signal: ctrl.signal,
        // BASE_URL is the API host itself; a redirect would drop the auth
        // header, so treat one as an error rather than silently failing.
        redirect: "error",
      });

      if (res.status === 429 && rateLimitWaits < 1) {
        rateLimitWaits++;
        const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
        const waitMs = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000, 30_000);
        logError("rate limited (429)", `path=${path} waiting ${waitMs}ms`);
        await sleep(waitMs);
        continue; // same attempt number
      }
      if (res.status === 401 || res.status === 403) {
        throw new FirstEventsError("FIRST Events auth rejected (check credentials)", res.status, false);
      }
      if (res.status === 404) throw new FirstEventsError("not found", 404, false);
      if (res.status === 429 || res.status >= 500) {
        throw new FirstEventsError(`upstream ${res.status}`, res.status, true);
      }
      if (!res.ok) throw new FirstEventsError(`unexpected status ${res.status}`, res.status, false);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new FirstEventsError("invalid JSON response", res.status, false);
      }
    } catch (err) {
      let e: FirstEventsError;
      if (err instanceof FirstEventsError) e = err;
      else {
        const isTimeout = err instanceof Error && err.name === "AbortError";
        e = new FirstEventsError(isTimeout ? "request timed out" : "network error", 0, true);
      }
      lastErr = e;
      if (e.retryable && attempt < MAX_RETRIES) {
        attempt++;
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new FirstEventsError("request failed", 0, false);
}

function listOf(data: unknown, key: string): unknown[] {
  return isObj(data) && Array.isArray(data[key]) ? (data[key] as unknown[]) : [];
}

// ---------------------------------------------------------------------------
// Public API (paths per the official v2.0 contract)
// ---------------------------------------------------------------------------

/** Team details for a season. Null when FIRST has no team with that number. */
export async function getFirstEventsTeam(season: number, teamNumber: number): Promise<FirstTeam | null> {
  try {
    const data = await firstEventsFetch(`/${season}/teams?teamNumber=${teamNumber}`);
    for (const t of listOf(data, "teams")) {
      const v = validateTeam(t);
      if (v && v.teamNumber === teamNumber) return v;
    }
    return null; // never substitute an unrelated team
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return null;
    throw err;
  }
}

/** Events a team is registered for in a season (GET /events?teamNumber=). */
export async function getFirstEventsTeamEvents(season: number, teamNumber: number): Promise<FirstTeamEvent[]> {
  try {
    const data = await firstEventsFetch(`/${season}/events?teamNumber=${teamNumber}`);
    const seen = new Set<string>();
    const out: FirstTeamEvent[] = [];
    for (const e of listOf(data, "events")) {
      const v = validateTeamEvent(e);
      const key = v?.eventCode.toLowerCase();
      if (v && key && !seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out.sort((a, b) => (a.dateStart || "").localeCompare(b.dateStart || ""));
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}

/** Single event details. Null when FIRST has no event with that code. */
export async function getFirstEventsEvent(season: number, eventCode: string): Promise<FirstEvent | null> {
  try {
    const data = await firstEventsFetch(`/${season}/events?eventCode=${encodeURIComponent(eventCode)}`);
    for (const e of listOf(data, "events")) {
      const v = validateEvent(e);
      if (v && v.eventCode.toLowerCase() === eventCode.toLowerCase()) return v;
    }
    return null; // never substitute an unrelated event
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return null;
    throw err;
  }
}

const MAX_TEAM_PAGES = 10;

/** Teams at an event (GET /teams?eventCode=, all pages), deduped. */
export async function getFirstEventsEventTeams(
  season: number,
  eventCode: string
): Promise<{ teamNumber: number; name: string }[]> {
  const seen = new Set<number>();
  const out: { teamNumber: number; name: string }[] = [];
  for (let page = 1; page <= MAX_TEAM_PAGES; page++) {
    let data: unknown;
    try {
      data = await firstEventsFetch(`/${season}/teams?eventCode=${encodeURIComponent(eventCode)}&page=${page}`);
    } catch (err) {
      if (err instanceof FirstEventsError && err.status === 404) break;
      throw err;
    }
    for (const t of listOf(data, "teams")) {
      const v = validateTeam(t);
      if (v && !seen.has(v.teamNumber)) {
        seen.add(v.teamNumber);
        out.push({ teamNumber: v.teamNumber, name: v.name });
      }
    }
    const pageTotal = isObj(data) ? num(data.pageTotal) : null;
    if (!pageTotal || page >= pageTotal) break;
  }
  return out.sort((a, b) => a.teamNumber - b.teamNumber);
}

/** Rankings at an event (GET /rankings/{eventCode}); [] before rankings exist. */
export async function getFirstEventsRankings(season: number, eventCode: string): Promise<FirstRanking[]> {
  try {
    const data = await firstEventsFetch(`/${season}/rankings/${encodeURIComponent(eventCode)}`);
    const seen = new Set<number>();
    const out: FirstRanking[] = [];
    for (const r of listOf(data, "rankings")) {
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

function dedupeMatches(raw: unknown[]): FirstMatch[] {
  const seen = new Set<string>();
  const out: FirstMatch[] = [];
  for (const m of raw) {
    const v = validateMatch(m);
    if (!v) continue;
    const key = matchKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.sort((a, b) =>
    a.level !== b.level
      ? (a.level === "qual" ? -1 : 1)
      : (a.series ?? 0) - (b.series ?? 0) || a.matchNumber - b.matchNumber
  );
}

/** Match schedule (GET /schedule/{eventCode}?tournamentLevel=); [] when unpublished. */
export async function getFirstEventsSchedule(
  season: number,
  eventCode: string,
  level: "qual" | "playoff"
): Promise<FirstMatch[]> {
  try {
    const data = await firstEventsFetch(
      `/${season}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=${level}`
    );
    return dedupeMatches(listOf(data, "schedule"));
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}

/** Scored match results, all levels (GET /matches/{eventCode}); [] when none. */
export async function getFirstEventsMatches(season: number, eventCode: string): Promise<FirstMatch[]> {
  try {
    const data = await firstEventsFetch(`/${season}/matches/${encodeURIComponent(eventCode)}`);
    return dedupeMatches(listOf(data, "matches"));
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return [];
    throw err;
  }
}

/** Playoff alliances (GET /alliances/{eventCode}); [] when not formed yet. */
export async function getFirstEventsAlliances(season: number, eventCode: string): Promise<FirstAlliance[]> {
  try {
    const data = await firstEventsFetch(`/${season}/alliances/${encodeURIComponent(eventCode)}`);
    const seen = new Set<number>();
    const out: FirstAlliance[] = [];
    for (const a of listOf(data, "alliances")) {
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

export interface FirstAdvancement {
  /** Where teams advance to (event code or a label), when published. */
  advancesTo: string | null;
  /** Number of advancement slots. */
  slots: number;
  /** Per-team outcome: FIRST = advanced from here, ALREADY_ADVANCING = qualified earlier, INELIGIBLE. */
  rows: { team: number; status: string; declined: boolean }[];
}

/** Advancement slots and outcomes for an event. Null when not published. */
export async function getFirstEventsAdvancement(season: number, eventCode: string): Promise<FirstAdvancement | null> {
  try {
    const data = await firstEventsFetch(`/${season}/advancement/${encodeURIComponent(eventCode)}`);
    if (!isObj(data)) return null;
    const slots = num(data.slots);
    if (!slots) return null;
    const rows: FirstAdvancement["rows"] = [];
    for (const r of listOf(data, "advancement")) {
      if (!isObj(r)) continue;
      const team = num(r.team);
      const status = str(r.status);
      if (team && status) rows.push({ team, status, declined: r.declined === true });
    }
    return { advancesTo: str(data.advancesTo), slots, rows };
  } catch (err) {
    if (err instanceof FirstEventsError && err.status === 404) return null;
    throw err;
  }
}
