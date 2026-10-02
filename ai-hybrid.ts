// Hybrid AI provider layer for Control Point.
//
// Routes each Bruno chat request to the cheapest capable provider:
//   - Groq (free tier, OpenAI-compatible API) for ordinary chat and simple
//     structured actions — the high-volume path.
//   - Gemini with google_search grounding for requests that need live web /
//     current external information.
// The router is a pure deterministic function: no model call is spent deciding
// where to send the request (that decision is the "fast path").
//
// Fallback policy: if Groq fails with a rate limit, server error, or transport
// failure, the request fails over ONCE to ungrounded Gemini (a different
// provider = a different quota bucket). Auth/config errors (401/400) are never
// failed over — they indicate a bad key or bad request, and hiding them would
// mask a real config problem.
//
// Setup: set GROQ_API_KEY in the environment (free at
// https://console.groq.com/keys). Optional: GROQ_MODEL to pick a model
// (default: openai/gpt-oss-120b). Until the key is set, everything routes to
// Gemini exactly as before — deploying this is safe before the key exists.

import {
  readStreamChunk,
  fetchWithPolicy,
  BUILD_HELPER_SYSTEM,
  buildHelperChat,
  getAISetting,
  type AiUsage,
  type ChatMessage,
} from "./ai.js";

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_TIMEOUT_MS = 90_000;
// Groq sits behind Cloudflare, which 1010-blocks non-browser user agents.
const GROQ_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type AIProvider = "groq" | "gemini";

export function groqModel(): string {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
}

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function groqKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  return key;
}

// --- Router ----------------------------------------------------------------
// Explicit, deterministic routing. Deliberately biased TOWARD grounding on
// uncertainty: a grounded Gemini answer to a simple question just costs quota,
// but a Groq answer to a question needing current facts risks hallucination.

/** Patterns that strongly suggest the answer needs live external information. */
const NEEDS_WEB_PATTERNS: RegExp[] = [
  /\bsearch\b.{0,20}\bweb\b|\bweb\b.{0,20}\bsearch\b/i, // "search the web for…"
  /\bsearch\s*:/i, // "search: …"
  /\blook\s+it?\s*up\b/i, // "look up", "lookup"
  /\bgoogle\s+it\b/i,
  /\b(latest|newest|breaking|just\s+(announced|released|launched|published))\b/i,
  /\bcurrent\b.{0,30}\b(news|events|standings|rankings|prices?|rules?)\b/i,
  /\bftc\b.{0,40}\b(news|announcement|update)\b/i, // FTC news/updates (not team announcements)
  /\b(game\s*manual|rulebook|q\s*&\s*a|ftc-?qa)\b/i, // rules may have changed since training
  /\b(what|when|where|who|which)\b[^?.!]{0,80}\b20(2[6-9]|[3-9]\d)\b/i, // dated factual questions
  /\b(20(2[6-9]|[3-9]\d))\b.{0,40}\b(season|kickoff|championship|worlds)\b/i,
  /\b(price|pricing|in\s+stock|availability|backorder)\b/i, // supplier facts
  /https?:\/\//i, // pasted link to research
];

/** Team-action contexts that look web-ish but aren't (e.g. "post an announcement"). */
const TEAM_ACTION_GUARD: RegExp[] = [
  /\b(post|send|write|draft|create|make|publish)\b.{0,40}\bannouncement\b/i,
  /\bour\s+team\b.{0,40}\b(news|update)\b/i,
];

export function needsWebSearch(text: string): boolean {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (TEAM_ACTION_GUARD.some((re) => re.test(t))) return false;
  return NEEDS_WEB_PATTERNS.some((re) => re.test(t));
}

export interface RouteDecision {
  provider: AIProvider;
  /** True when the request should use Gemini's google_search grounding. */
  grounded: boolean;
  reason: string;
}

export function routeChatRequest(opts: {
  text: string;
  webSearch?: boolean;
  hasImages?: boolean;
  /** Owner override (settings → chat_provider): skip Groq entirely. */
  forceGemini?: boolean;
}): RouteDecision {
  // Vision requests stay on Gemini — that path is tested and working.
  if (opts.hasImages) {
    return { provider: "gemini", grounded: false, reason: "image input: Gemini vision path" };
  }
  // Explicit client request (a future "Search web" toggle) always wins.
  if (opts.webSearch === true) {
    return { provider: "gemini", grounded: true, reason: "explicit web-search request" };
  }
  if (needsWebSearch(opts.text)) {
    return { provider: "gemini", grounded: true, reason: "message needs current web information" };
  }
  // Complete Gemini rollover: the owner decided Groq's free tier isn't worth
  // its failure modes. Everything goes to Gemini (ungrounded here).
  if (opts.forceGemini) {
    return { provider: "gemini", grounded: false, reason: "owner setting: Gemini only" };
  }
  if (isGroqConfigured()) {
    return { provider: "groq", grounded: false, reason: "ordinary chat: Groq default" };
  }
  return { provider: "gemini", grounded: false, reason: "Groq not configured: Gemini fallback" };
}

// --- Groq provider (OpenAI-compatible chat completions) ---------------------

function extractGroqText(data: any): string {
  try {
    return data?.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

export function extractGroqUsage(data: any): AiUsage | null {
  try {
    const u = data?.usage;
    if (!u) return null;
    const promptTokens = u.prompt_tokens || 0;
    const responseTokens = u.completion_tokens || 0;
    return {
      promptTokens,
      responseTokens,
      totalTokens: u.total_tokens || promptTokens + responseTokens,
    };
  } catch {
    return null;
  }
}

/** True when Groq rejected the call because the free-tier allowance is spent. */
export function isGroqQuotaError(err: any): boolean {
  const msg = String(err?.message || err || "");
  return /Groq API error 429/i.test(msg) || /rate_limit_exceeded/i.test(msg);
}

/** User-facing copy for Groq quota exhaustion. Plain: the fix is quota reset
 *  or billing on the Groq side, not retrying. */
export const GROQ_QUOTA_EXHAUSTED_MSG =
  "Bruno's free Groq allowance is used up right now — it refills on its own (usually daily). " +
  "If this keeps happening, the team owner can add billing to the Groq API key for uninterrupted use.";

/** Groq failures worth failing over to Gemini for. Auth/config errors (401/400)
 *  are excluded on purpose: failing over would hide a bad key or bad request. */
function isGroqFailoverable(err: any): boolean {
  const msg = String(err?.message || err || "");
  return (
    /Groq API error 429/i.test(msg) ||
    /Groq API error 5\d\d/i.test(msg) ||
    /timed out/i.test(msg) ||
    /stalled/i.test(msg) ||
    /aborted/i.test(msg) ||
    /fetch failed/i.test(msg)
  );
}

async function callGroq(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  stream: boolean;
  onChunk?: (text: string) => void;
  onUsage?: (u: AiUsage) => void;
  signal?: AbortSignal;
}): Promise<string> {
  // Gemini roles are "user" | "model"; OpenAI expects "user" | "assistant".
  const body: any = {
    model: groqModel(),
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({
        role: m.role === "model" ? "assistant" : "user",
        content: m.text,
      })),
    ],
    max_tokens: opts.maxTokens,
    temperature: 0.7,
    // GPT-OSS models reason before answering; keep it snappy for chat so the
    // reasoning budget doesn't eat the reply.
    reasoning_effort: "low",
    stream: opts.stream,
  };

  const res = await fetchWithPolicy(
    `${GROQ_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey()}`,
        "User-Agent": GROQ_USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: GROQ_TIMEOUT_MS, label: "Groq", signal: opts.signal }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 2000)}`);
  }

  if (!opts.stream || !res.body) {
    const data = await res.json();
    const u = extractGroqUsage(data);
    if (u && opts.onUsage) opts.onUsage(u);
    return extractGroqText(data);
  }

  // Parse the OpenAI-style SSE stream: "data: {...}" lines, "[DONE]" terminator.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let lastUsage: AiUsage | null = null;
  const maxAccumChars = Math.max(8000, opts.maxTokens * 8);
  for (;;) {
    if (opts.signal?.aborted) break;
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await readStreamChunk(reader);
    } catch (err) {
      try {
        await reader.cancel();
      } catch {
        /* noop */
      }
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
        const parsed = JSON.parse(payload);
        const u = extractGroqUsage(parsed);
        if (u) lastUsage = u;
        const text = parsed?.choices?.[0]?.delta?.content || "";
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
  try {
    await reader.cancel();
  } catch {
    /* noop */
  }
  if (lastUsage && opts.onUsage) opts.onUsage(lastUsage);
  return full;
}

// --- Unified chat entry ------------------------------------------------------

export interface AIChatResult {
  text: string;
  provider: AIProvider;
  grounded: boolean;
}

/**
 * Route a Bruno chat request to the right provider and run it.
 * Returns the reply text plus which provider served it (for usage logging).
 * Throws with `err.aiProvider` set to the provider that failed, so callers
 * can attribute failed attempts in the owner dashboard.
 */
export async function aiChat(opts: {
  extraSystem?: string;
  messages: ChatMessage[];
  maxTokens: number;
  stream: boolean;
  webSearch?: boolean;
  images?: { mimeType: string; data: string }[];
  onChunk?: (text: string) => void;
  onUsage?: (u: AiUsage) => void;
  signal?: AbortSignal;
}): Promise<AIChatResult> {
  if (!isGroqConfigured() && !isGeminiConfigured()) {
    throw new Error("AI not configured: set GROQ_API_KEY or GEMINI_API_KEY");
  }
  const latestUser = [...opts.messages].reverse().find((m) => m.role === "user")?.text || "";
  const forceGemini = (await getAISetting("chat_provider", "hybrid")) === "gemini";
  const route = routeChatRequest({
    text: latestUser,
    webSearch: opts.webSearch,
    hasImages: (opts.images?.length || 0) > 0,
    forceGemini,
  });
  const system = opts.extraSystem
    ? BUILD_HELPER_SYSTEM + "\n\n" + opts.extraSystem
    : BUILD_HELPER_SYSTEM;

  const fail = (provider: AIProvider, err: any): never => {
    (err as any).aiProvider = provider;
    throw err;
  };

  if (route.provider === "groq") {
    try {
      const text = await callGroq({
        system,
        messages: opts.messages,
        maxTokens: opts.maxTokens,
        stream: opts.stream,
        onChunk: opts.onChunk,
        onUsage: opts.onUsage,
        signal: opts.signal,
      });
      return { text, provider: "groq", grounded: false };
    } catch (err: any) {
      // One failover to ungrounded Gemini on rate limits / server errors /
      // transport failures (different provider = different quota bucket).
      // Anything else — bad key, bad request — throws honestly.
      if (isGeminiConfigured() && isGroqFailoverable(err)) {
        console.warn("[AI] Groq failed (%s); failing over once to Gemini", String(err?.message || err).slice(0, 120));
        try {
          const text = await buildHelperChat(
            opts.messages,
            opts.maxTokens,
            opts.onChunk,
            opts.extraSystem,
            opts.onUsage,
            opts.signal,
            false // ungrounded: this is the degraded path, keep it cheap
          );
          return { text, provider: "gemini", grounded: false };
        } catch (geminiErr: any) {
          fail("gemini", geminiErr);
        }
      }
      fail("groq", err);
    }
  }

  // Gemini route (grounded for web research, plain for images).
  try {
    const text = await buildHelperChat(
      opts.messages,
      opts.maxTokens,
      opts.onChunk,
      opts.extraSystem,
      opts.onUsage,
      opts.signal,
      route.grounded
    );
    return { text, provider: "gemini", grounded: route.grounded };
  } catch (err: any) {
    fail("gemini", err);
  }
}
