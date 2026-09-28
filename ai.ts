// AI backend for Control Point.
// Uses the Google Gemini API (free tier, no credit card) server-side so the
// API key never reaches the browser. All four AI features stream plain-text
// chunks, matching what the React client's aiService expects.
//
// Setup: set GEMINI_API_KEY in the environment (get one free at
// https://aistudio.google.com/app/apikey). Optional: GEMINI_MODEL to pick a
// different model (default: gemini-2.5-flash-lite, the cheapest fast model).
// Until the key is set, the /api/ai/* endpoints answer 501 "AI not configured".

import { dbGet } from "./db.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

export function aiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function isAIConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
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

async function callGemini(opts: {
  system: string;
  user: string;
  maxTokens: number;
  stream: boolean;
  useSearchGrounding?: boolean;
  onChunk?: (text: string) => void;
}): Promise<string> {
  const model = aiModel();
  const endpoint = opts.stream ? "streamGenerateContent" : "generateContent";
  const url = `${API_BASE}/models/${model}:${endpoint}${opts.stream ? "?alt=sse" : ""}`;

  const body: any = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents: [{ parts: [{ text: opts.user }] }],
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0.7 },
  };
  if (opts.useSearchGrounding) {
    body.tools = [{ google_search: {} }];
  }

  const doFetch = async (withGrounding: boolean) => {
    const b = withGrounding ? body : { ...body, tools: undefined };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(b),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
    }
    return res;
  };

  let res: Response;
  try {
    res = await doFetch(!!opts.useSearchGrounding);
  } catch (err: any) {
    // If search grounding isn't supported for this model/key, retry plain.
    if (opts.useSearchGrounding) {
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
  for (;;) {
    const { done, value } = await reader.read();
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
        }
      } catch {
        /* skip malformed chunk */
      }
    }
  }
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
  onChunk: (text: string) => void
): Promise<string> {
  return callGemini({ system, user, maxTokens, stream: true, onChunk });
}

// --- Feature prompts -------------------------------------------------------

export const SCOUT_SYSTEM = `You are Control Point's AI Scout, a news assistant for FIRST Tech Challenge (FTC) robotics teams. You write concise, well-organized news roundups. Use short sections with bold headlines and 1-2 sentence items. Never invent specific dates, scores, or announcements you are not confident about; when unsure, say so.`;

export async function scoutNews(maxTokens: number, onChunk?: (t: string) => void): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const user = `Today is ${today}. Give a roundup of the latest FIRST Tech Challenge and REV Robotics news that a student robotics team should know: current or upcoming season game updates, rule changes, new REV/FTC products, major community announcements, and notable competitions. Keep it scannable — sections with bold headlines, brief items. If using search results, prefer official sources (firstinspires.org, revrobotics.com). End with one line noting the roundup reflects the latest available information as of ${today}.`;
  if (onChunk) {
    return callGemini({ system: SCOUT_SYSTEM, user, maxTokens, stream: true, useSearchGrounding: true, onChunk });
  }
  return callGemini({ system: SCOUT_SYSTEM, user, maxTokens, stream: false, useSearchGrounding: true });
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
