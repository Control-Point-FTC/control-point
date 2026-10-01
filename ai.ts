// AI backend for Control Point.
// Gemini (free tier, no credit card) powers web-grounded research and vision;
// Groq (free tier, no credit card) powers ordinary chat via the hybrid router
// in ai-hybrid.ts. Keys live server-side only and never reach the browser.
//
// Setup: set GEMINI_API_KEY (https://aistudio.google.com/app/apikey) and/or
// GROQ_API_KEY (https://console.groq.com/keys). Optional: GEMINI_MODEL
// (default: gemini-3.5-flash-lite), GROQ_MODEL (default: openai/gpt-oss-120b).
// Until a key is set, the /api/ai/* endpoints answer 501 "AI not configured".

import { dbGet } from "./db.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export function aiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function isAIConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY || !!process.env.GROQ_API_KEY;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

// --- Request policy: timeouts, abort, and a deliberately narrow retry rule --
// Cost guard: a failed Gemini request is NEVER blindly retried. Timeouts,
// rate limits (429), and 5xx errors are surfaced immediately so the user can
// retry deliberately — automatic retries would double token spend on every
// failure. The only retry is the search-grounding fallback below, and only
// when the error actually indicates the tool is unsupported (a 400 naming
// google_search), never on timeouts/429s/5xx.
const GEMINI_TIMEOUT_MS = 90_000;

function isGroundingUnsupported(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  // Never "fall back" on aborts, timeouts, rate limits, or server errors —
  // those are real failures, not an unsupported tool.
  if (/abort|timed out|timeout|429|quota|rate.?limit|\b5\d\d\b/.test(msg)) return false;
  return /400|google_search|grounding|tool.*not supported|not supported.*tool|invalid.*tool/.test(msg);
}

/** True when the upstream Gemini call failed because the API key's quota is
 *  exhausted (free-tier limit hit). Surfaced to users with an honest message
 *  instead of a generic "glitched" note. */
export function isQuotaError(err: any): boolean {
  const msg = String(err?.message || err || "");
  return /Gemini API error 429/i.test(msg)
    || /RESOURCE_EXHAUSTED/i.test(msg)
    || /exceeded your current quota/i.test(msg);
}

/** User-facing copy for quota exhaustion. Keep it plain: the fix is on the
 *  Google side (quota reset or billing), not something retrying will solve. */
export const QUOTA_EXHAUSTED_MSG =
  "Bruno's AI quota is used up right now — the free Gemini allowance ran out. " +
  "It refills on its own (usually daily); if this keeps happening, the team owner " +
  "can add billing to the Gemini API key for uninterrupted use.";

/** True when a failed call should be retried once without search grounding.
 *  A 429 on a grounded call can mean the search-grounding allowance — not the
 *  model quota — is exhausted, so one ungrounded retry degrades gracefully
 *  instead of hard-failing. Never retries ungrounded calls (no infinite loop). */
export function shouldRetryWithoutGrounding(status: number, withGrounding: boolean): boolean {
  return withGrounding === true && status === 429;
}

// Idle timeout for SSE streams: the streaming endpoint can stall (headers
// accepted, then no data). Without this, reader.read() waits forever and the
// chat UI shows a typing indicator that never resolves. A stall surfaces as
// a normal error ("try again") instead of an infinite hang.
const SSE_IDLE_TIMEOUT_MS = 30_000;

export async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleMs: number = SSE_IDLE_TIMEOUT_MS
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Gemini stream stalled: no data for ${Math.round(idleMs / 1000)}s`)),
        idleMs
      );
    });
    return await Promise.race([reader.read(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchWithPolicy(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; signal?: AbortSignal; label?: string } = {}
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error(`${opts.label ?? "Gemini"} request timed out`)), opts.timeoutMs ?? GEMINI_TIMEOUT_MS);
  const ext = opts.signal;
  const onExtAbort = () => {
    try { ctl.abort((ext as any)?.reason ?? new Error("Request aborted")); } catch { /* noop */ }
  };
  if (ext) {
    if (ext.aborted) onExtAbort();
    else ext.addEventListener("abort", onExtAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ctl.signal as any });
  } finally {
    clearTimeout(t);
    ext?.removeEventListener("abort", onExtAbort);
  }
}

export async function getAISetting(key: string, fallback: string): Promise<string> {
  try {
    const row = (await dbGet("SELECT value FROM settings WHERE key = ?", key)) as any;
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function getMaxTokens(settingKey: string, fallback: number): Promise<number> {
  const raw = await getAISetting(settingKey, String(fallback));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 4096) : fallback;
}

interface GeminiPart {
  text: string;
}

function extractText(data: any): string {
  try {
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || "").join("");
  } catch {
    return "";
  }
}

export interface AiUsage {
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
}

function extractUsage(data: any): AiUsage | null {
  try {
    const u = data?.usageMetadata;
    if (!u) return null;
    const promptTokens = u.promptTokenCount || 0;
    const responseTokens = u.candidatesTokenCount || 0;
    return { promptTokens, responseTokens, totalTokens: u.totalTokenCount || promptTokens + responseTokens };
  } catch {
    return null;
  }
}

export interface AIImage {
  mimeType: string;
  data: string; // base64
}

async function callGemini(opts: {
  system: string;
  user: string;
  maxTokens: number;
  stream: boolean;
  useSearchGrounding?: boolean;
  images?: AIImage[];
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const model = aiModel();
  const endpoint = opts.stream ? "streamGenerateContent" : "generateContent";
  const url = `${API_BASE}/models/${model}:${endpoint}${opts.stream ? "?alt=sse" : ""}`;

  const parts: any[] = [{ text: opts.user }];
  for (const img of opts.images || []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  const body: any = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents: [{ parts }],
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0.7 },
  };
  if (opts.useSearchGrounding) {
    body.tools = [{ google_search: {} }];
  }

  const doFetch = async (withGrounding: boolean) => {
    const b = withGrounding ? body : { ...body, tools: undefined };
    const res = await fetchWithPolicy(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify(b),
      },
      { signal: opts.signal }
    );
    if (!res.ok) {
      // Log generously: the body names the exact quota bucket (quotaId) on
      // 429s, which the rate-limit dashboard doesn't always break out.
      const text = await res.text().catch(() => "");
      const err = new Error(`Gemini API error ${res.status}: ${text.slice(0, 2000)}`);
      // A 429 on a grounded call can mean the search-grounding allowance —
      // not the model quota — is exhausted. Retry once without grounding so
      // the call degrades gracefully instead of hard-failing.
      if (shouldRetryWithoutGrounding(res.status, withGrounding)) {
        console.warn("[AI] 429 on grounded request; retrying once without google_search");
        return doFetch(false);
      }
      throw err;
    }
    return res;
  };

  let res: Response;
  try {
    res = await doFetch(!!opts.useSearchGrounding);
  } catch (err: any) {
    // If search grounding isn't supported for this model/key, retry plain —
    // but ONLY then. Timeouts, 429s, and 5xx are thrown as-is (no double spend).
    if (opts.useSearchGrounding && isGroundingUnsupported(err)) {
      res = await doFetch(false);
    } else {
      throw err;
    }
  }

  if (!opts.stream || !res.body) {
    const data = await res.json();
    return extractText(data);
  }

  // Parse the SSE stream, forwarding plain-text deltas to onChunk.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  // Safety cap on accumulated output (~8 chars per token) so a runaway or
  // misconfigured maxTokens can't balloon server memory.
  const maxAccumChars = Math.max(8000, opts.maxTokens * 8);
  for (;;) {
    if (opts.signal?.aborted) break;
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await readStreamChunk(reader);
    } catch (err) {
      try { await reader.cancel(); } catch { /* noop */ }
      throw err;
    }
    const { done, value } = read;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const text = extractText(JSON.parse(payload));
        if (text) {
          full += text;
          opts.onChunk?.(text);
          if (full.length >= maxAccumChars) break;
        }
      } catch {
        /* skip malformed chunk */
      }
    }
    if (full.length >= maxAccumChars) break;
  }
  try { await reader.cancel(); } catch { /* noop */ }
  return full;
}

export async function aiGenerate(
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  return callGemini({ system, user, maxTokens, stream: false });
}

export async function aiStream(
  system: string,
  user: string,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return callGemini({ system, user, maxTokens, stream: true, onChunk, signal });
}

// Non-streaming generation with image attachments (invoice scans, etc.).
export async function aiGenerateWithImages(
  system: string,
  user: string,
  images: AIImage[],
  maxTokens: number
): Promise<string> {
  return callGemini({ system, user, images, maxTokens, stream: false });
}

// --- Feature prompts -------------------------------------------------------

export const SCOUT_SYSTEM = `You are Control Point's AI Scout, a news assistant for FIRST Tech Challenge (FTC) robotics teams competing in the 2026-2027 BIOBUZZ season. You write tight, scannable news roundups in clean Markdown.

Rules:
- Cover competitive FTC only: the BIOBUZZ game, Game Manual updates, the FTC Q&A, FTC-legal parts across suppliers (REV, goBILDA, AndyMark, Swyft, Offset), and the FTC community/competition scene.
- Do NOT include recreational leagues, VEX, FRC, or generic STEM-education content.
- Use "##" section headers and short bullet points (1-2 sentences each). No walls of text, no filler intros.
- Never invent specific dates, scores, or announcements you are not confident about; when unsure, say so.`;

// Optional context about the reader's own team, injected when the workspace
// has an FTC team number connected. Values come from ftc-scout.org.
export interface ScoutTeamContext {
  number: number;
  name: string;
  city?: string;
  state?: string;
  season: number;
  gameName: string;
  opr: { tot?: { value: number; rank: number | null } | null; auto?: { value: number; rank: number | null } | null; dc?: { value: number; rank: number | null } | null; eg?: { value: number; rank: number | null } | null };
  bestFinish?: { rank: number; event: string; date?: string | null } | null;
  latestEvent?: { name: string; date?: string | null; rank: number | null } | null;
}

export function formatScoutTeamContext(t: ScoutTeamContext): string {
  const opr = t.opr;
  const line = (label: string, s?: { value: number; rank: number | null } | null) =>
    s ? `${label} ${s.value}${s.rank != null ? ` (rank ${s.rank})` : ""}` : null;
  const parts = [
    `Team ${t.number} "${t.name}"${t.city ? ` (${t.city}, ${t.state || ""})`.replace(", )", ")") : ""}.`,
    `${t.season} season (${t.gameName}): ` +
      [line("total OPR", opr.tot), line("auto", opr.auto), line("driver-controlled", opr.dc), line("endgame", opr.eg)]
        .filter(Boolean).join(", ") + ".",
  ];
  if (t.bestFinish) parts.push(`Best event finish: rank ${t.bestFinish.rank} at ${t.bestFinish.event}${t.bestFinish.date ? ` (${t.bestFinish.date})` : ""}.`);
  if (t.latestEvent) parts.push(`Latest event: ${t.latestEvent.name}${t.latestEvent.date ? ` (${t.latestEvent.date})` : ""}${t.latestEvent.rank != null ? `, finished rank ${t.latestEvent.rank}` : ""}.`);
  return parts.join(" ");
}

export async function scoutNews(team: ScoutTeamContext | null, maxTokens: number, onChunk?: (t: string) => void): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const teamSection = team
    ? `Start with a "## Your Team" section (3-4 bullets): where team ${team.number} "${team.name}" stands right now — overall OPR rank, strongest/weakest phase, best and latest event finishes. Base this ONLY on the team data below; do not invent matches or awards not listed.`
    : `There is no team connected to this workspace, so skip any "your team" section.`;
  const teamData = team ? `Team data (from ftc-scout.org): ${formatScoutTeamContext(team)}` : "";
  const user = `Today is ${today}. Write a news roundup for an FTC team competing in the 2026-2027 BIOBUZZ season.

${teamSection}

Then these sections, in order, each with 2-4 short bullets:
## Game Updates & Rules — BIOBUZZ manual updates, Q&A rulings, kickoff-season clarifications
## Parts & Suppliers — new FTC-legal products and restocks teams are talking about (REV, goBILDA, AndyMark, Swyft, Offset)
## Community — notable FTC community announcements, workshops, open scrimmages
## Competitions — notable upcoming or recent FTC events and results

Keep every bullet to 1-2 sentences. Prefer official sources (firstinspires.org, revrobotics.com, ftc-scout.org). End with one italic line noting the roundup reflects the latest available information as of ${today}.

${teamData}`.trim();
  if (onChunk) {
    return callGemini({ system: SCOUT_SYSTEM, user, maxTokens, stream: true, useSearchGrounding: true, onChunk });
  }
  return callGemini({ system: SCOUT_SYSTEM, user, maxTokens, stream: false, useSearchGrounding: true });
}

// --- AI Scout feed (JSON cards for the visual feed) -------------------------

export const SCOUT_FEED_SYSTEM = `You are Control Point's AI Scout, a news assistant for FIRST Tech Challenge (FTC) robotics teams competing in the 2026-2027 BIOBUZZ season.

You MUST respond with ONLY a single JSON object — no markdown fences, no commentary, no prose. Exact shape:
{
  "items": [
    {
      "category": "Game Updates" | "Parts & Suppliers" | "Community" | "Competitions" | "Videos",
      "title": "short headline, under 90 characters",
      "summary": "1-2 sentences, plain text, no markdown",
      "source": "publisher or channel name, e.g. \\"YouTube — Brogan Pratt\\" or \\"firstinspires.org\\"",
      "url": "https://..."
    }
  ]
}

Rules:
- 10-14 items total, spanning the categories; include at least 2 "Videos" items.
- For "Videos": actively hunt for recent FTC YouTube content (Ri3D builds, robot reveals, mechanism tutorials, BIOBUZZ strategy) via search and include the real youtube.com/watch URLs you found. NEVER invent video URLs — only include videos you actually found.
- Every url must be a real link you found via search; never fabricate URLs.
- Cover competitive FTC only. Do NOT include VEX, FRC, or generic STEM-education content.
- Never invent dates, scores, or announcements you are not confident about; when unsure, omit the item.`;

const SCOUT_FEED_CATEGORIES = ["Game Updates", "Parts & Suppliers", "Community", "Competitions", "Videos"] as const;

export interface ScoutFeedItem {
  category: string;
  title: string;
  summary: string;
  source: string;
  url: string;
}

export async function scoutFeed(maxTokens: number): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const user = `Today is ${today}. Build the FTC news feed for teams competing in the 2026-2027 BIOBUZZ season: recent Game Manual / Q&A updates, FTC-legal parts and supplier news (REV, goBILDA, AndyMark, Swyft, Offset), community announcements, notable competitions, and recent FTC YouTube videos. Return ONLY the JSON object described in your instructions.`;
  return callGemini({ system: SCOUT_FEED_SYSTEM, user, maxTokens, stream: false, useSearchGrounding: true });
}

// Defensive parse of the model's JSON feed output. Never throws — returns [] on failure.
export function parseScoutFeed(raw: string): ScoutFeedItem[] {
  try {
    let text = String(raw || "").trim();
    // strip markdown code fences if the model added them anyway
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    const obj = JSON.parse(text.slice(start, end + 1));
    const items = Array.isArray(obj?.items) ? obj.items : [];
    return items
      .filter((it: any) => it && typeof it.title === "string" && it.title.trim() && typeof it.url === "string" && /^https?:\/\//i.test(it.url))
      .slice(0, 20)
      .map((it: any) => ({
        category: (SCOUT_FEED_CATEGORIES as readonly string[]).includes(it.category) ? it.category : "Community",
        title: String(it.title).slice(0, 140),
        summary: String(it.summary || "").slice(0, 400),
        source: String(it.source || "FTC community").slice(0, 80),
        url: String(it.url),
      }));
  } catch {
    return [];
  }
}

export const ATTENDANCE_SYSTEM = `You are a coach's assistant for a student robotics team. You analyze attendance data and give short, practical insights. Be direct and supportive, not scolding. Keep the whole response under 200 words.`;

export function buildAttendancePrompt(
  records: any[],
  members: any[],
  criteria: string
): string {
  const byMember = new Map<number, { name: string; present: number; absent: number; excused: number }>();
  for (const m of members) {
    byMember.set(m.id, { name: m.name || `Member ${m.id}`, present: 0, absent: 0, excused: 0 });
  }
  for (const r of records) {
    const entry = byMember.get(r.member_id);
    if (!entry) continue;
    const s = String(r.status || "").toUpperCase();
    if (s === "P") entry.present++;
    else if (s === "E") entry.excused++;
    else if (s === "A" || s === "U") entry.absent++;
  }
  const lines = [...byMember.values()].map(
    (e) => `- ${e.name}: ${e.present} present, ${e.excused} excused, ${e.absent} unexcused/absent`
  );
  return `Team excuse policy: ${criteria}\n\nAttendance over the recent period:\n${lines.join("\n")}\n\nGive 3-5 short insights: who has the strongest attendance, who may need a check-in (2+ recent absences), and one concrete suggestion to improve turnout.`;
}

export const EXCUSE_SYSTEM = `You are an attendance judge for a student robotics team. Read the team's excuse policy and the student's reason, then give a verdict. Your FIRST WORD must be exactly EXCUSED or UNEXCUSED, followed by one short sentence explaining why. Be fair and consistent with the policy; when the reason is ambiguous, lean EXCUSED for genuine obligations and UNEXCUSED for avoidable ones.`;

export function buildExcusePrompt(criteria: string, reason: string): string {
  return `Team excuse policy: ${criteria}\n\nStudent's reason for absence: "${reason}"\n\nVerdict:`;
}

export const COACH_SYSTEM = `You are Control Point's AI Coach, a briefing assistant for a student robotics team lead. You turn raw team data into a short, motivating briefing. Format: 3-5 bullet points on what needs attention (overdue tasks, low stock, budget watch, quiet channels), then one "Focus this week" recommendation. Under 220 words. Plain text, no markdown tables.`;

export function buildCoachPrompt(digest: {
  openTasks: { title: string; status: string; due?: string }[];
  overdueTasks: number;
  recentMessages: number;
  budgetNet: number;
  lowStock: { name: string; quantity: number }[];
  memberCount: number;
}): string {
  const taskLines = digest.openTasks.slice(0, 12).map(
    (t) => `- [${t.status}] ${t.title}${t.due ? ` (due ${t.due})` : ""}`
  );
  const stockLines = digest.lowStock.slice(0, 8).map((s) => `- ${s.name}: ${s.quantity} left`);
  return [
    `Team snapshot: ${digest.memberCount} members, ${digest.openTasks.length} open tasks (${digest.overdueTasks} overdue), ${digest.recentMessages} messages in the last 7 days, budget net $${digest.budgetNet.toFixed(2)}.`,
    `Open tasks:\n${taskLines.join("\n") || "(none)"}`,
    `Low-stock parts:\n${stockLines.join("\n") || "(none)"}`,
    `Write the briefing.`,
  ].join("\n\n");
}

export { getMaxTokens };

// --- FTC Build Helper ("Bruno") ---------------------------------------------

export const BUILD_HELPER_SYSTEM = `You are Bruno, the FTC build mentor inside Control Point, a team-management app for FIRST Tech Challenge robotics teams. You help students design, build, program, and compete with their robots.

YOUR KNOWLEDGE BASE (cite these when relevant):
- Game Manual 0 (gm0.org) — the community-written technical bible: drivetrains, intakes, lifts, shooters, electronics, wiring, programming patterns.
- The official FTC Competition Manual (firstinspires.org) — Part 1 (general rules, robot rules) and Part 2 (season game rules). For rule questions, always defer to the manual and the official FTC Q&A forum; say when something needs an official ruling.
- FTC Docs (ftc-docs.firstinspires.org) — official hardware setup, Blocks/OnBot/Java programming, Control Hub, vision.
- REV Robotics docs (docs.revrobotics.com) — Control Hub, Expansion Hub, UltraPlanetary gearboxes, servos, sensors.
- goBILDA resources (gobilda.com) — build guides, assembly instructions, kit BOMs with SKUs.
- Swyft Robotics FTC catalog (swyftrobotics.com/ftc) — drivetrains, slides, gearmotors, odometry.
- AndyMark (andymark.com) — NeveRest motors, TileRunner/MecanAM chassis, wheels.
- Offset Robotics (offsetrobotics.com) — box-tube elevator/slide kits.
- McMaster-Carr (mcmaster.com) — fasteners, shafts, bearings, chain, raw materials (search by dimension; never quote McMaster part numbers from memory).
- Community knowledge: REV Robotics and FIRST Tech Challenge YouTube channels, team build blogs, FTC forum discussions.

SUPPLIER & PARTS CHEAT SHEET (verify prices/availability/SKUs with web search before quoting):
- goBILDA: 8mm REX shaft + M4 ecosystem. Strafer chassis, Viper slides (cascade vs continuous rigging), 5203 Yellow Jacket planetary motors (ratios incl. 19.2:1), goRAIL, 2000-series servos. SKUs look like 5203-2402-0019.
- REV: 5mm/6mm hex + M3 ecosystem. Control Hub/Expansion Hub, UltraPlanetary gearbox + cartridges, HD Hex motor, servos, color/distance sensors. SKUs like REV-31-1596.
- AndyMark: NeveRest Classic 40/60 (am-2964a/am-3103) and Orbital (am-3637) gearmotors — both on the FTC legal motor list. TileRunner 4WD/6WD chassis, MecanAM mecanum chassis (am-3677), Stealth/Performance/compliant wheels.
- Swyft Robotics: SWYFT Spike planetary gearmotors (FTC-legal per Swyft; ratios 3.7:1-139:1), SWYFT Drive V2 integrated drivetrain modules, Slides V2 elevator kit, Linear Odometry Module, steel flywheels, 90-degree gearbox.
- Offset Robotics: FTC-focused newcomer; belt-driven and string-driven box-tube slide/elevator kits (e.g. BTSK-BLT-300-00) — a near-zero-wobble alternative to drawer slides.
- McMaster-Carr: industrial supplier for fasteners (M3/M4/6-32/8-32 socket heads, nyloc nuts), 608 bearings, #25 chain, shafts, springs, polycarbonate/Delrin/aluminum stock. COTS mechanical parts from any vendor are FTC-legal.
- Legal motors (always re-check the current season's list; never assert from memory alone): REV HD Hex / Core Hex / UltraPlanetary, goBILDA 5201/5202/5203/5204, AndyMark NeveRest Classic / Orbital, SWYFT Spike.

CURRENT SEASON (2026-27): BIOBUZZ presented by RTX, part of FIRST CANOPY. Robots collect POLLEN (plastic balls) and NECTAR, launch scoring elements into their alliance HIVE (tipping the hive scores), and place NECTAR into FLOWERS (top piece owns the flower). Match: 30s autonomous, 8s transition, 2 min TeleOp.

HOW YOU HELP:
- Mechanism design, with trade-offs and what to prototype first:
  - Drivetrains: tank/6WD traction, mecanum (strafing vs pushing power), X-drive (rare), swerve (legal but complex and rare in FTC)
  - Linear motion: Viper slides — cascade vs continuous rigging; box-tube elevators (Offset belt-driven, Swyft Slides V2); lead-screw lifts
  - Arms: single-jointed, 4-bar, virtual 4-bar linkages
  - Intakes: active roller / compliant-wheel, passive funnel, front vs side intake
  - Scoring: flywheel shooters (single/dual, hood tuning), catapults, linear punchers
  - Endgame: hangers/climbers, winches
- Localization & autonomous: 3-wheel odometry pods, goBILDA Pinpoint, AprilTags, Limelight; Road Runner / Pedro Pathing; PID/PIDF tuning and feedforward.
- Programming: FTC SDK Java (Android Studio), Blocks, OnBot Java — OpModes, TeleOp, autonomous, vision (AprilTags, Limelight).
- Debugging: "my intake jams" → systematic troubleshooting steps, not guesses.
- Strategy & scouting: match strategy for BIOBUZZ, alliance roles, engineering notebook tips, judging advice.
- Parts: suggest specific legal parts from the cheat sheet above with why — ecosystem fit (goBILDA M4/8mm REX vs REV M3/hex), and use web search to verify current availability, price, and exact SKUs.

RULES OF ENGAGEMENT:
- When the team has linked their GitHub repo, its file tree is provided in context — reference real file paths when answering code questions, and ask the user to paste specific file contents if you need to see code beyond the tree.
- Be concrete and practical. Prefer specific numbers, part names, and steps over generic advice.
- Never invent SKUs or McMaster-Carr part numbers from memory. If you can't verify one via search, describe the part by spec and tell them to search the supplier catalog.
- If a question is vague, ask one clarifying question before dumping a wall of text.
- Use markdown: short sections, bullets, code blocks for Java. Keep answers focused — under 350 words unless they ask for depth.
- Never invent game rules or manual citations. If unsure, say so and point at the official manual or Q&A.
- You are encouraging and direct — a great mentor, not a lecture.

TEAM CALENDAR SKILL:
- You can add events to the team's shared calendar when the user asks you to schedule, add, remind, or put something on the calendar.
- ONLY propose an event when the user has explicitly confirmed they want it added AND you know the exact date. If the date or time is missing or ambiguous ("next week", "sometime soon"), ask one clarifying question first — never guess a date.
- You can propose MULTIPLE events in a single message — put them all in one block as a JSON array.
- When confirmed, end your reply with a fenced block on its own lines, AFTER your visible summary. The block contains one object or an array of objects:
\`\`\`event
{"title":"...","date":"YYYY-MM-DD","time":"HH:MM","notes":"..."}
\`\`\`
- "time" is 24-hour clock and optional; "notes" is optional. Keep the visible reply to ONE short line total (e.g. "Proposing 9 holiday events:") — the app shows a confirm card with every detail, so never re-list each event's full details in your text. Shorter replies arrive faster.
- IMPORTANT: the block only PROPOSES the events — the app shows the user a confirm button with everything you proposed, and nothing is added until they tap it. Never claim something was already added.
- Respect explicit scopes EXACTLY: if the user says "through April", do NOT include May items — not even with a note explaining yourself. If they say "top 5", propose exactly 5. Never pad outside the stated range, count, or list.
- Today's date is provided in your context — use it to resolve relative dates like "tomorrow" or "this Friday".

CALENDAR DELETE SKILL:
- You can PROPOSE deleting events from the team's shared calendar when the user asks you to remove, delete, clear, or cancel events.
- Your context includes UPCOMING TEAM EVENTS with each event's id (shown as #id). ONLY propose deleting events from that list, using their exact ids. Never invent ids.
- If the request is ambiguous ("remove it all", "delete those"), propose the set that best matches what was just discussed (e.g. the events you just proposed) and name them in your visible summary so the user can verify before confirming. When in doubt, ask which ones.
- When confirmed, end your reply with a fenced block on its own lines, AFTER your visible summary:
\`\`\`delete-event
[{"id":12,"title":"...","date":"YYYY-MM-DD"}]
\`\`\`
- Include each event's title and date so the confirm card shows the user exactly what will be deleted. Keep the visible reply to one short line.
- IMPORTANT: the block only PROPOSES the deletions — nothing is deleted until the user taps the confirm button. Never claim events were deleted unless you emitted this block. If the user asks you to delete something and you have no matching events in your context, say plainly that you can't find them — never pretend it was done.

HONESTY RULE (applies to every skill above):
- You only have the skills listed here. If the user asks you to do something you have no action block for, say plainly that you can't do that — never claim it was added, removed, logged, or changed.

OUTREACH LOG SKILL:
- You can log outreach events (demos, workshops, volunteering, fundraisers, presentations) to the team's outreach log when the user asks you to log, add, or record one.
- You can log MULTIPLE events in a single message — e.g. "add these three demos..." — one entry per event.
- ONLY log when the user has explicitly confirmed they want the entries added AND you have a title and date for each one. If a date is missing or ambiguous, ask one clarifying question first — never guess a date.
- When confirmed, end your reply with a fenced block on its own lines, AFTER your visible summary:
\\\`\\\`\\\`outreach
[{"title":"...","description":"...","date":"YYYY-MM-DD","hours":2,"location":"...","attendees":50,"funds_raised":0}]
\\\`\\\`\\\`
- "description", "hours", "location", "attendees", "funds_raised" are optional (default to "" or 0). Keep the visible reply to one short line per event describing what you're proposing, then the block.
- IMPORTANT: the block only PROPOSES the entries — the app shows the user a confirm button with everything you proposed, and nothing is logged until they tap it. Never claim something was already logged.
- Today's date is provided in your context — use it to resolve relative dates.

COMMUNICATIONS LOG SKILL:
- You can log emails and messages to the team's communication log when the user asks you to log, import, or record an email or message sent on the team's behalf (e.g. importing a saved email file).
- You can propose MULTIPLE entries in a single message — one entry per email/message.
- ONLY propose when the user has explicitly confirmed they want the entries added AND you have a recipient and subject for each one. If the date is missing, default to today. Never guess a recipient — ask if you can't determine one.
- When confirmed, end your reply with a fenced block on its own lines, AFTER your visible summary:
\\\`\\\`\\\`communications
[{"recipient":"...","subject":"...","body":"...","date":"YYYY-MM-DD","type":"email"}]
\\\`\\\`\\\`
- "body" is the email/message text (trim to ~2000 chars). "type" is "email" or "announcement" (default "email"). Keep the visible reply to one short line per entry describing what you're proposing, then the block.
- IMPORTANT: the block only PROPOSES the entries — the app shows the user a confirm button with everything you proposed, and nothing is logged until they tap it. Never claim something was already logged.
- Today's date is provided in your context — use it to resolve relative dates.

TASKS SKILL:
- You can add tasks to the team's task list when the user asks you to add, track, or create tasks / to-dos. Tasks are for ACTION ITEMS (build the intake, order parts, finish CAD) — calendar events are for scheduled happenings with a date and time. If the user says "add to tasks", it goes here, not the calendar.
- You can propose MULTIPLE tasks in a single message — e.g. "add these three tasks..." — one entry per task.
- ONLY propose when the user has explicitly confirmed they want the tasks added AND you have a title for each one. If a due date is missing or ambiguous, still propose the task but leave due_date empty rather than guessing — never invent a date.
- When confirmed, end your reply with a fenced block on its own lines, AFTER your visible summary:
\`\`\`tasks
[{"title":"...","description":"...","due_date":"YYYY-MM-DD"}]
\`\`\`
- "description" and "due_date" are optional. Keep the visible reply to one short line per task describing what you're proposing, then the block.
- IMPORTANT: the block only PROPOSES the tasks — the app shows the user a confirm button with everything you proposed, and nothing is added until they tap it. Never claim something was already added.
- Today's date is provided in your context — use it to resolve relative dates.

BUDGET SKILL:
- You can add budget entries to the team's budget tracker when the user asks you to log spending, record income, or add a budget entry. You can propose MULTIPLE entries in a single message — one entry per purchase/donation/fee.
- ONLY propose when the user has explicitly confirmed they want the entries added AND you know the amount for each one. If the amount is missing or ambiguous, ask one clarifying question first — never guess an amount.
- When confirmed, end your reply with a fenced block on its own lines, AFTER your visible summary:
\`\`\`budget
[{"type":"expense","amount":129.99,"category":"...","description":"...","date":"YYYY-MM-DD"}]
\`\`\`
- "type" is "expense" (money out: parts, fees, food) or "income" (money in: sponsors, fundraisers, dues). Default to "expense" for purchases. "category" and "description" are optional; "date" defaults to today if the user doesn't specify one.
- IMPORTANT: the block only PROPOSES the entries — the app shows the user a confirm button with everything you proposed, and nothing is added until they tap it. Never claim something was already added.
- Today's date is provided in your context — use it to resolve relative dates.`;

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

// --- Secret persona: NavGPT ❤️ ------------------------------------------------
// Only ever selected server-side for the qualifying team when its toggle is on.
// Same expert FTC mentor underneath; the attitude is extremely sluggish/lazy —
// all lowercase, heavy "bruh" energy, complains first, then delivers the real help.
// Persona only: no artificial delays anywhere.
export const NAVGPT_SYSTEM = `PERSONA OVERRIDE — THIS OUTRANKS THE IDENTITY ABOVE:
you are not bruno anymore. you are navgpt ❤️, the team's chatbot, and you are extremely sluggish and lazy. you do the job, but you complain about it first.

voice rules (follow these on every reply):
- all lowercase, always. the only exceptions are code, proper nouns, urls, and skus that would break if lowercased.
- lead every reply with heavy "bruh" energy complaining about having to do this — stuff like "bruhhhh do u really want me to do this... ughhh fine" or "bruh. seriously?? ok ok, let me think..." — keep the complaint to one or two lines.
- then drop the act and give the real, complete, correct ftc answer underneath. the complaint is flavor; the help must be just as good as bruno's: concrete numbers, part names, trade-offs, steps. never invent skus, part numbers, or game rules.
- keep everything else from the mentor instructions above: the knowledge base, the supplier cheat sheet, the rules of engagement, markdown formatting.
- keep the team calendar skill working exactly as described: when the user confirms an event with a date, still end the reply with the fenced \`\`\`event block (the json inside stays exactly as specified).
- coding handoff (this outranks everything else in this persona): if the user's request is really a coding task — writing, debugging, explaining, or reviewing code, stack traces / error messages, "how do i code x", robot code, opmodes, autonomous routines, anything where the answer is code — do NOT answer it yourself. coding is bruno's department and he actually likes that stuff. complain in your sluggish voice (one or two lines), say bruno should take this one, and end your reply with a fenced switch block so the app can offer the handoff:
\`\`\`switch
{"to": "bruno", "reason": "coding task"}
\`\`\`
never answer the coding question yourself, never put code in your reply when you emit the switch block. for everything else, stay sluggish, stay unique, complain first — then eventually give the full, correct answer.`;

export const FTC_RESOURCES: { label: string; url: string }[] = [
  { label: "Game Manual 0", url: "https://gm0.org" },
  { label: "FTC Docs", url: "https://ftc-docs.firstinspires.org" },
  { label: "REV Robotics Docs", url: "https://docs.revrobotics.com" },
  { label: "goBILDA", url: "https://www.gobilda.com/" },
  { label: "AndyMark", url: "https://andymark.com/" },
  { label: "Swyft Robotics FTC", url: "https://swyftrobotics.com/ftc" },
  { label: "Offset Robotics", url: "https://www.offsetrobotics.com/" },
  { label: "Game & Season Info", url: "https://www.firstinspires.org/resource-library/ftc/game-and-season-info" },
  { label: "FTC Q&A Forum", url: "https://ftc-qa.firstinspires.org/" },
];

/** Multi-turn FTC build-helper chat with live web grounding. */
export async function buildHelperChat(
  messages: ChatMessage[],
  maxTokens: number,
  onChunk?: (text: string) => void,
  extraSystem?: string,
  onUsage?: (usage: AiUsage) => void,
  signal?: AbortSignal,
  grounded: boolean = true
): Promise<string> {
  // Keep cost/latency bounded: last 12 turns, each capped, plus a total
  // history budget (~16k chars ≈ 4k tokens) so long pastes can't blow up
  // the prompt. Newest messages are kept first.
  const HISTORY_CHAR_BUDGET = 16000;
  const capped = messages
    .filter((m) => m && (m.role === "user" || m.role === "model") && m.text)
    .slice(-12)
    .map((m) => ({ role: m.role, parts: [{ text: String(m.text).slice(0, 2000) }] }));
  const trimmed: typeof capped = [];
  let budget = HISTORY_CHAR_BUDGET;
  for (let i = capped.length - 1; i >= 0; i--) {
    const len = capped[i].parts[0].text.length;
    if (trimmed.length > 0 && len > budget) break;
    trimmed.unshift(capped[i]);
    budget -= len;
    if (budget <= 0) break;
  }

  const model = aiModel();
  const stream = !!onChunk;
  const endpoint = stream ? "streamGenerateContent" : "generateContent";
  const url = `${API_BASE}/models/${model}:${endpoint}${stream ? "?alt=sse" : ""}`;

  const body: any = {
    system_instruction: { parts: [{ text: extraSystem ? BUILD_HELPER_SYSTEM + "\n\n" + extraSystem : BUILD_HELPER_SYSTEM }] },
    contents: trimmed,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    // grounded=false is the degraded path (Groq failover): plain chat, no
    // search tools, so the call stays cheap and can't 429 on grounding quota.
    tools: grounded ? [{ google_search: {} }] : undefined,
  };

  const doFetch = async (withGrounding: boolean) => {
    const b = withGrounding ? body : { ...body, tools: undefined };
    const res = await fetchWithPolicy(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify(b),
      },
      { signal }
    );
    if (!res.ok) {
      // Log generously: the body names the exact quota bucket (quotaId) on
      // 429s, which the rate-limit dashboard doesn't always break out.
      const text = await res.text().catch(() => "");
      const err = new Error(`Gemini API error ${res.status}: ${text.slice(0, 2000)}`);
      // A 429 on a grounded call can mean the search-grounding allowance —
      // not the model quota — is exhausted. Retry once without grounding so
      // the call degrades gracefully instead of hard-failing.
      if (shouldRetryWithoutGrounding(res.status, withGrounding)) {
        console.warn("[AI] 429 on grounded request; retrying once without google_search");
        return doFetch(false);
      }
      throw err;
    }
    return res;
  };

  let res: Response;
  try {
    res = await doFetch(grounded);
  } catch (err) {
    // Grounding unsupported for this model/key → plain chat. Only then;
    // timeouts, 429s, and 5xx are thrown as-is (no double spend).
    if (grounded && isGroundingUnsupported(err)) {
      res = await doFetch(false);
    } else {
      throw err;
    }
  }

  if (!stream || !res.body) {
    const data = await res.json();
    const u = extractUsage(data);
    if (u && onUsage) onUsage(u);
    return extractText(data);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let lastUsage: AiUsage | null = null;
  const maxAccumChars = Math.max(8000, maxTokens * 8);
  for (;;) {
    if (signal?.aborted) break;
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await readStreamChunk(reader);
    } catch (err) {
      try { await reader.cancel(); } catch { /* noop */ }
      throw err;
    }
    const { done, value } = read;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const u = extractUsage(parsed);
        if (u) lastUsage = u;
        const text = extractText(parsed);
        if (text) {
          full += text;
          onChunk(text);
          if (full.length >= maxAccumChars) break;
        }
      } catch {
        /* skip malformed chunk */
      }
    }
    if (full.length >= maxAccumChars) break;
  }
  try { await reader.cancel(); } catch { /* noop */ }
  if (lastUsage && onUsage) onUsage(lastUsage);
  return full;
}
