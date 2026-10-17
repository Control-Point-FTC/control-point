/**
 * Bruno writes Control Scout's weekly power-rankings blurbs.
 *
 * Scout sends a fact packet (POST /internal/bruno/power-rankings, contract in
 * the header of server/sharedAccounts.ts); Bruno turns it into one short blurb
 * per team plus an intro, as strict JSON. Everything here is pure (no DB, no
 * network) so the packet check, the prompt and the output parser are testable
 * on their own; the route wires them to aiChat.
 *
 * Bruno only ever sees the packet: the call is offline (no web grounding), and
 * the prompt forbids anything not in it. Scout still fact-checks every blurb
 * before publishing, so a slip here costs a blurb, never a wrong fact.
 */

export const MAX_TEAMS = 25;
export const MAX_BLURB_WORDS = 50;
export const MAX_INTRO_WORDS = 80;
const MAX_NAME = 80;
const MAX_EVENT = 120;
const MAX_RESULT = 80;
const MAX_NOTES = 200;
const WEEK_RE = /^\d{4}-w(0[1-9]|[1-4]\d|5[0-3])$/;

export interface PacketTeam {
  team: number;
  name: string;
  rank: number;
  /** Last published rank, or null when the team is new to the top 25. */
  priorRank: number | null;
  /** Places gained (negative = dropped), or null when new. */
  movement: number | null;
  rating: number;
  /** Rating change since the prior week, or null. */
  ratingDelta: number | null;
  record: { wins: number; losses: number; ties: number } | null;
  opr: number | null;
  lastEvent: { name: string; result: string | null } | null;
  notes?: string;
}

export interface PowerRankingsPacket {
  season: number;
  week: string;
  teams: PacketTeam[];
  notes?: string;
}

export interface PowerRankingsOutput {
  intro: string;
  blurbs: { team: number; text: string }[];
}

/** A check's result: `value` when ok, else `error` (the failing field). Loose on purpose: the repo builds without strictNullChecks, where a union on `ok` doesn't narrow. */
interface Check<T> { ok: boolean; value?: T; error?: string }

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
// eslint-disable-next-line no-control-regex
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

function str(v: unknown, max: number, field: string, optional = false): Check<string | undefined> {
  if (v === undefined || v === null) return optional ? { ok: true, value: undefined } : { ok: false, error: `${field}_required` };
  if (typeof v !== "string") return { ok: false, error: `${field}_invalid` };
  const s = clean(v);
  if (!s && !optional) return { ok: false, error: `${field}_required` };
  if (s.length > max) return { ok: false, error: `${field}_too_long` };
  return { ok: true, value: s || undefined };
}

function team(raw: any, i: number): Check<PacketTeam> {
  const at = (e: string) => ({ ok: false as const, error: `teams[${i}].${e}` });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return at("invalid");
  if (!isInt(raw.team, 1, 999_999)) return at("team");
  const name = str(raw.name, MAX_NAME, "name");
  if (!name.ok) return at(name.error);
  if (!isInt(raw.rank, 1, 100_000)) return at("rank");
  if (raw.priorRank !== null && raw.priorRank !== undefined && !isInt(raw.priorRank, 1, 100_000)) return at("priorRank");
  if (raw.movement !== null && raw.movement !== undefined && !isInt(raw.movement, -100_000, 100_000)) return at("movement");
  if (!isNum(raw.rating, -10_000, 10_000)) return at("rating");
  if (raw.ratingDelta !== null && raw.ratingDelta !== undefined && !isNum(raw.ratingDelta, -10_000, 10_000)) return at("ratingDelta");
  let record: PacketTeam["record"] = null;
  if (raw.record !== null && raw.record !== undefined) {
    const r = raw.record;
    if (!r || typeof r !== "object" || !isInt(r.wins, 0, 1000) || !isInt(r.losses, 0, 1000) || !isInt(r.ties ?? 0, 0, 1000)) return at("record");
    record = { wins: r.wins, losses: r.losses, ties: r.ties ?? 0 };
  }
  if (raw.opr !== null && raw.opr !== undefined && !isNum(raw.opr, -1000, 10_000)) return at("opr");
  let lastEvent: PacketTeam["lastEvent"] = null;
  if (raw.lastEvent !== null && raw.lastEvent !== undefined) {
    if (typeof raw.lastEvent !== "object" || Array.isArray(raw.lastEvent)) return at("lastEvent");
    const n = str(raw.lastEvent.name, MAX_EVENT, "lastEvent.name");
    if (!n.ok) return at(n.error);
    const r = str(raw.lastEvent.result, MAX_RESULT, "lastEvent.result", true);
    if (!r.ok) return at(r.error);
    lastEvent = { name: n.value!, result: r.value ?? null };
  }
  const notes = str(raw.notes, MAX_NOTES, "notes", true);
  if (!notes.ok) return at(notes.error);
  return {
    ok: true,
    value: {
      team: raw.team, name: name.value!, rank: raw.rank,
      priorRank: raw.priorRank ?? null, movement: raw.movement ?? null,
      rating: raw.rating, ratingDelta: raw.ratingDelta ?? null,
      record, opr: raw.opr ?? null, lastEvent,
      ...(notes.value ? { notes: notes.value } : {}),
    },
  };
}

/** Validate and normalise a fact packet. Unknown fields are dropped, never echoed to the model. */
export function validatePacket(body: any): Check<PowerRankingsPacket> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  if (!isInt(body.season, 2000, 2100)) return { ok: false, error: "season" };
  if (typeof body.week !== "string" || !WEEK_RE.test(body.week)) return { ok: false, error: "week" };
  if (!Array.isArray(body.teams) || body.teams.length < 1 || body.teams.length > MAX_TEAMS) return { ok: false, error: "teams" };
  const teams: PacketTeam[] = [];
  const seenTeams = new Set<number>();
  const seenRanks = new Set<number>();
  for (let i = 0; i < body.teams.length; i++) {
    const t = team(body.teams[i], i);
    if (!t.ok) return { ok: false, error: t.error };
    const v = t.value!;
    if (seenTeams.has(v.team)) return { ok: false, error: `teams[${i}].duplicate_team` };
    if (seenRanks.has(v.rank)) return { ok: false, error: `teams[${i}].duplicate_rank` };
    seenTeams.add(v.team);
    seenRanks.add(v.rank);
    teams.push(v);
  }
  const notes = str(body.notes, MAX_NOTES, "notes", true);
  if (!notes.ok) return { ok: false, error: notes.error };
  teams.sort((a, b) => a.rank - b.rank);
  return { ok: true, value: { season: body.season, week: body.week, teams, ...(notes.value ? { notes: notes.value } : {}) } };
}

/** Appended to Bruno's system prompt for this job. */
export const POWER_RANKINGS_SYSTEM = `POWER RANKINGS JOB (this outranks the chat instructions above for this reply):
You are writing the weekly FTC power rankings for Control Scout, Control Point's sister scouting site. You are given one JSON fact packet. Write like a friendly FTC commentator: warm, upbeat, specific.

Rules:
- Use ONLY facts in the packet. Never invent scores, match results, awards, events, alliances, robots, people or quotes. If a team has little data, keep its blurb short and general rather than guessing.
- Every number you write must appear in that team's packet entry (rank, prior rank, movement, rating, rating change, record, OPR). Do not compute new numbers (no averages, percentages or sums). Do not mention other teams' numbers in a blurb.
- Never mention, name or link any other scouting, stats or rankings website or app.
- One blurb per team in the packet, 1 or 2 sentences, at most ${MAX_BLURB_WORDS} words each.
- An intro of at most ${MAX_INTRO_WORDS} words about the week as a whole, using only packet facts.
- Plain text only: no markdown, no emoji, no links.
- Reply with JSON only, no code fences and nothing before or after it, exactly in this shape:
{"intro": "...", "blurbs": [{"team": 12345, "text": "..."}]}`;

export function buildPowerRankingsPrompt(p: PowerRankingsPacket): string {
  return `Fact packet for season ${p.season}, week ${p.week} (${p.teams.length} teams, ordered by rank):\n${JSON.stringify(p)}`;
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** The first top-level JSON object in a model reply (tolerates code fences and stray prose). */
function extractJson(raw: string): unknown {
  const s = String(raw || "").replace(/^﻿/, "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(body.slice(start, end + 1));
}

export interface ParseResult {
  output: PowerRankingsOutput;
  /** Blurbs left out, with why (logged; Scout writes its own for missing teams). */
  dropped: { team: unknown; reason: string }[];
}

/**
 * Parse Bruno's reply against the packet. Throws when the reply is not the
 * agreed JSON shape at all (the route answers 502). Individual blurbs that
 * break a rule (unknown or repeated team, empty, too long, not text) are left
 * out, and an over-long intro becomes "", so one slip never costs the week.
 */
export function parsePowerRankingsOutput(raw: string, packet: PowerRankingsPacket): ParseResult {
  let data: any;
  try {
    data = extractJson(raw);
  } catch {
    throw new Error("malformed_output");
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.blurbs)) throw new Error("malformed_output");
  if (data.intro !== undefined && data.intro !== null && typeof data.intro !== "string") throw new Error("malformed_output");
  const known = new Set(packet.teams.map((t) => t.team));
  const seen = new Set<number>();
  const blurbs: PowerRankingsOutput["blurbs"] = [];
  const dropped: ParseResult["dropped"] = [];
  for (const b of data.blurbs) {
    const teamNo = typeof b?.team === "string" && /^\d+$/.test(b.team) ? Number(b.team) : b?.team;
    if (!Number.isInteger(teamNo) || !known.has(teamNo)) { dropped.push({ team: b?.team, reason: "unknown_team" }); continue; }
    if (seen.has(teamNo)) { dropped.push({ team: teamNo, reason: "duplicate" }); continue; }
    if (typeof b.text !== "string") { dropped.push({ team: teamNo, reason: "not_text" }); continue; }
    const text = clean(b.text);
    if (!text) { dropped.push({ team: teamNo, reason: "empty" }); continue; }
    if (wordCount(text) > MAX_BLURB_WORDS) { dropped.push({ team: teamNo, reason: "too_long" }); continue; }
    seen.add(teamNo);
    blurbs.push({ team: teamNo, text });
  }
  if (!blurbs.length) throw new Error("malformed_output");
  let intro = clean(typeof data.intro === "string" ? data.intro : "");
  if (wordCount(intro) > MAX_INTRO_WORDS) { dropped.push({ team: null, reason: "intro_too_long" }); intro = ""; }
  // Packet order, so Scout can zip by team without re-sorting.
  const order = new Map(packet.teams.map((t, i) => [t.team, i]));
  blurbs.sort((a, b) => order.get(a.team)! - order.get(b.team)!);
  return { output: { intro, blurbs }, dropped };
}
