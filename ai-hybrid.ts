// Hybrid AI provider layer for Control Point.
//
// Routes each Bruno chat request to the cheapest capable provider:
//   - Gemini (free) for ordinary chat, web grounding, and vision — the
//     primary path.
//   - Anthropic (Claude) as fallback when Gemini hits rate limits or quota.
// The router is a pure deterministic function: no model call is spent deciding
// where to send the request (that decision is the "fast path").
//
// Fallback policy: if Gemini fails with a rate limit, server error, or
// transport failure, the request fails over ONCE to Anthropic (a different
// provider = a different quota bucket). Auth/config errors (401/400) are
// never failed over — they indicate a bad key or bad request, and hiding
// them would mask a real config problem.
//
// Setup: set GEMINI_API_KEY in the environment (https://aistudio.google.com)
// and ANTHROPIC_API_KEY (https://console.anthropic.com) for fallback.
// Until keys are set, requests fail with a clear config error.

import {
  readStreamChunk,
  fetchWithPolicy,
  BUILD_HELPER_SYSTEM,
  buildHelperChat,
  getAISetting,
  type AiUsage,
  type ChatMessage,
} from "./ai.js";
import { anthropicSources, dedupeSources, type WebSource } from "./server/webSources.js";

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
// claude-sonnet-4-20250514 was retired on 2026-06-15 (requests 404), so the
// fallback had been failing. ANTHROPIC_MODEL still overrides this.
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
// Bruno is chat: low effort keeps time-to-first-token down (the model skips
// thinking on most simple requests); ANTHROPIC_EFFORT overrides it.
const DEFAULT_ANTHROPIC_EFFORT = "low";
// On a policy decline, the API re-runs the request on a fallback model it
// picks by refusal category (Claude API only).
const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";
const ANTHROPIC_TIMEOUT_MS = 90_000;
// Claude's server-side web tools for grounded questions (prices, stock, rule
// changes). Capped so a reply stays quick and well under the server loop's
// iteration limit (no pause_turn to resume).
const ANTHROPIC_WEB_TOOLS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
];
const ANTHROPIC_VERSION = "2023-06-01";

export type AIProvider = "gemini" | "anthropic";

/** Pluggable OpenAI-compatible chat provider. Kept for reference; the active
 *  providers are Gemini (via buildHelperChat) and Anthropic (via
 *  callAnthropicChat below). */
interface OpenAIProviderConfig {
  id: string;
  /** Human label used in error prefixes and logs. */
  label: string;
  base: string;
  key: () => string;
  model: () => string;
  timeoutMs: number;
  userAgent?: string;
  /** Extra body fields merged into the chat-completions request. */
  extraBody?: Record<string, any>;
}

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

function anthropicEffort(): string {
  const e = String(process.env.ANTHROPIC_EFFORT || "").toLowerCase();
  return ["low", "medium", "high", "xhigh", "max"].includes(e) ? e : DEFAULT_ANTHROPIC_EFFORT;
}

/** What Bruno says when every model declined the request (stop_reason "refusal"). */
export const ANTHROPIC_REFUSAL_MSG = "I can't help with that one. Try rephrasing, or ask me something else.";

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function anthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

// --- Router ----------------------------------------------------------------
// Explicit, deterministic routing. Deliberately biased TOWARD grounding on
// uncertainty: a grounded Gemini answer to a simple question just costs quota,
// but an ungrounded answer to a question needing current facts risks hallucination.

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
  /\bhow\s+much\b.{0,40}\b(cost|costs|charge|sell)\b/i, // "how much does a servo cost"
  /\b(costs?|cheap(est|er)|on\s+sale|discount|coupon|lead\s+time|out\s+of\s+stock|sold\s+out|restock(ed)?|discontinued)\b/i,
  /\bwhere\s+(can|do|should|could)\s+(i|we)\s+(buy|get|order)\b|\bwhere\s+to\s+(buy|order)\b/i,
  /\b(fact[-\s]?check|double[-\s]?check|verify)\b/i, // "fact-check that"
  /\bis\s+(that|this|it)\s+(still\s+)?(true|correct|accurate|up\s+to\s+date)\b/i,
  /\bstill\b.{0,30}\b(available|legal|allowed|sold|made|in\s+stock|true)\b/i,
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
  /** Owner override (settings → chat_provider): skip the hybrid order. */
  forceProvider?: "gemini" | "anthropic";
}): RouteDecision {
  // Vision requests stay on Gemini — that path is tested and working.
  if (opts.hasImages) {
    return { provider: "gemini", grounded: false, reason: "image input: Gemini vision path" };
  }
  // Web questions are grounded. Gemini's google_search is the free default;
  // Claude searches with its own web tools when the owner chose Anthropic or
  // Gemini isn't set up.
  const web = opts.webSearch === true ? "explicit web-search request" : needsWebSearch(opts.text) ? "message needs current web information" : "";
  if (web) {
    const claude = isAnthropicConfigured() && (opts.forceProvider === "anthropic" || !isGeminiConfigured());
    return claude
      ? { provider: "anthropic", grounded: true, reason: `${web}: Claude web search` }
      : { provider: "gemini", grounded: true, reason: web };
  }
  // Owner override: everything goes to the chosen provider (ungrounded here).
  if (opts.forceProvider === "gemini") {
    return { provider: "gemini", grounded: false, reason: "owner setting: Gemini only" };
  }
  if (opts.forceProvider === "anthropic") {
    if (isAnthropicConfigured()) {
      return { provider: "anthropic", grounded: false, reason: "owner setting: Anthropic" };
    }
    return { provider: "gemini", grounded: false, reason: "owner setting: Anthropic (key missing, Gemini fallback)" };
  }
  // Hybrid order: Gemini (free) for everything, Anthropic as fallback on quota.
  // The fallback happens in aiChat(), not here — this just picks the primary.
  return { provider: "gemini", grounded: false, reason: "ordinary chat: Gemini (free primary)" };
}

// --- OpenAI-compatible provider calls (Fireworks, …) ------------------

function extractOpenAIText(data: any): string {
  try {
    return data?.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

export function extractOpenAIUsage(data: any): AiUsage | null {
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

/** Back-compat alias (tests import the old name). */
export const extractGroqUsage = extractOpenAIUsage;

/** True when the provider rejected the call because its quota/credits are spent.
 *  The provider label must be present — a bare rate_limit_exceeded code alone
 *  doesn't identify which provider complained. */
export function isOpenAIQuotaError(err: any, label: string): boolean {
  const msg = String(err?.message || err || "");
  if (new RegExp(`${label} API error 429`, "i").test(msg)) return true;
  return new RegExp(label, "i").test(msg) && /rate_limit_exceeded/i.test(msg);
}

/** True when Anthropic rejected the call because its quota/credits are spent. */
export function isAnthropicQuotaError(err: any): boolean {
  const msg = String(err?.message || err || "");
  return /Anthropic API error 429/i.test(msg) || (/anthropic/i.test(msg) && /rate_limit/i.test(msg));
}

/** User-facing copy for Anthropic credit exhaustion. */
export const ANTHROPIC_QUOTA_EXHAUSTED_MSG =
  "Bruno's Anthropic credits are used up right now — the key needs a top-up at console.anthropic.com.";

/** Provider failures worth failing over for. Auth/config errors (401/400)
 *  are excluded on purpose: failing over would hide a bad key or bad request. */
function isAnthropicFailoverable(err: any): boolean {
  const msg = String(err?.message || err || "");
  return (
    /Anthropic API error 429/i.test(msg) ||
    /Anthropic API error 5\d\d/i.test(msg) ||
    /overloaded/i.test(msg) ||
    /timed out/i.test(msg) ||
    /fetch failed/i.test(msg)
  );
}

function isGeminiFailoverable(err: any): boolean {
  const msg = String(err?.message || err || "");
  return (
    /429/.test(msg) ||
    /5\d\d/.test(msg) ||
    /quota/i.test(msg) ||
    /rate.?limit/i.test(msg) ||
    /timed out/i.test(msg) ||
    /fetch failed/i.test(msg)
  );
}

function extractAnthropicText(data: any): string {
  try {
    const blocks = data?.content || [];
    return blocks.filter((b: any) => b.type === "text").map((b: any) => b.text || "").join("");
  } catch {
    return "";
  }
}

export function extractAnthropicUsage(data: any): AiUsage | null {
  try {
    const u = data?.usage;
    if (!u) return null;
    const promptTokens = u.input_tokens || 0;
    const responseTokens = u.output_tokens || 0;
    return { promptTokens, responseTokens, totalTokens: promptTokens + responseTokens };
  } catch {
    return null;
  }
}

/**
 * Call Anthropic's Messages API (not OpenAI-compatible: system is a top-level
 * param, roles are user/assistant, response nests text in content blocks).
 */
async function callAnthropicChat(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  stream: boolean;
  onChunk?: (text: string) => void;
  onUsage?: (u: AiUsage) => void;
  signal?: AbortSignal;
  /** Let Claude search the web and read pages (server tools). */
  webSearch?: boolean;
  onSources?: (s: WebSource[]) => void;
}): Promise<string> {
  const body: any = {
    model: anthropicModel(),
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.text || " ",
    })),
    // Without this the API answers with one JSON body, which the SSE reader
    // below finds no events in, so streamed fallback replies came back empty.
    stream: opts.stream,
    output_config: { effort: anthropicEffort() },
    fallbacks: "default",
  };
  if (opts.webSearch) body.tools = ANTHROPIC_WEB_TOOLS;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": anthropicKey(),
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-beta": ANTHROPIC_FALLBACK_BETA,
  };

  const send = (b: any) => fetchWithPolicy(
    `${ANTHROPIC_API_BASE}/messages`,
    { method: "POST", headers, body: JSON.stringify(b) },
    { timeoutMs: ANTHROPIC_TIMEOUT_MS, label: "Anthropic", signal: opts.signal }
  );
  let res = await send(body);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Web tools turned off for the organization (or not offered on this
    // model): answer without them rather than fail the whole reply.
    if (body.tools && res.status === 400 && /web_search|web_fetch|tool/i.test(text)) {
      console.warn("[AI] Anthropic rejected the web tools; retrying once without them");
      const { tools: _t, ...plain } = body;
      res = await send(plain);
      if (!res.ok) {
        const t2 = await res.text().catch(() => "");
        throw new Error(`Anthropic API error ${res.status}: ${t2.slice(0, 2000)}`);
      }
    } else {
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 2000)}`);
    }
  }
  const cited: WebSource[] = [];
  const results: WebSource[] = [];
  const collect = (ev: any) => {
    const f = anthropicSources(ev);
    cited.push(...f.cited);
    results.push(...f.results);
  };
  // Pages Claude cited, else the top pages it searched.
  const reportSources = () => {
    const list = cited.length ? cited : results.slice(0, 3);
    if (list.length) opts.onSources?.(list);
  };

  if (!opts.stream || !res.body) {
    const data = await res.json();
    const u = extractAnthropicUsage(data);
    if (u && opts.onUsage) opts.onUsage(u);
    for (const b of data?.content || []) collect(b);
    reportSources();
    const text = extractAnthropicText(data);
    // Read stop_reason before content: a decline may have no text, or stop part-way.
    if (data?.stop_reason === "refusal") return text.trim() ? `${text}\n\n(${ANTHROPIC_REFUSAL_MSG})` : ANTHROPIC_REFUSAL_MSG;
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let lastUsage: AiUsage | null = null;
  let refused = false;
  let streamError: { type?: string; message?: string } | null = null;
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
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload);
        collect(parsed);
        if (parsed?.type === "content_block_delta" && parsed?.delta?.type === "text_delta") {
          const text = parsed.delta.text || "";
          if (text) {
            full += text;
            opts.onChunk?.(text);
            if (full.length >= maxAccumChars) break;
          }
        }
        if (parsed?.type === "message_delta" && parsed?.usage) {
          lastUsage = extractAnthropicUsage({ usage: parsed.usage });
        }
        if (parsed?.type === "message_delta" && parsed?.delta?.stop_reason === "refusal") refused = true;
        // An error mid-stream (overloaded, rate limited, ...) arrives as an SSE
        // event on a 200 response: fail like a non-200 so the caller's error
        // and failover paths run instead of returning a partial reply.
        if (parsed?.type === "error") streamError = parsed.error || { type: "error", message: "stream error" };
      } catch { /* skip malformed chunk */ }
      if (streamError) break;
    }
    if (full.length >= maxAccumChars || streamError) break;
  }
  try { await reader.cancel(); } catch { /* noop */ }
  if (streamError) {
    const status = streamError.type === "overloaded_error" ? 529 : streamError.type === "rate_limit_error" ? 429 : 500;
    throw new Error(`Anthropic API error ${status}: ${streamError.type}: ${String(streamError.message || "").slice(0, 500)}`);
  }
  if (lastUsage && opts.onUsage) opts.onUsage(lastUsage);
  reportSources();
  if (refused) {
    // A decline mid-reply: say so rather than ending on half a sentence.
    const note = full.trim() ? `\n\n(${ANTHROPIC_REFUSAL_MSG})` : ANTHROPIC_REFUSAL_MSG;
    full += note;
    opts.onChunk?.(note);
  }
  return full;
}

// --- Legacy OpenAI-compatible helpers (Fireworks removed) -------------------

async function callOpenAIChat(
  cfg: OpenAIProviderConfig,
  opts: {
    system: string;
    messages: ChatMessage[];
    maxTokens: number;
    stream: boolean;
    onChunk?: (text: string) => void;
    onUsage?: (u: AiUsage) => void;
    signal?: AbortSignal;
  }
): Promise<string> {
  // Gemini roles are "user" | "model"; OpenAI expects "user" | "assistant".
  const body: any = {
    model: cfg.model(),
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({
        role: m.role === "model" ? "assistant" : "user",
        content: m.text,
      })),
    ],
    max_tokens: opts.maxTokens,
    temperature: 0.7,
    ...(cfg.extraBody || {}),
    stream: opts.stream,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.key()}`,
    Accept: "application/json",
  };
  if (cfg.userAgent) headers["User-Agent"] = cfg.userAgent;

  const res = await fetchWithPolicy(
    `${cfg.base}/chat/completions`,
    { method: "POST", headers, body: JSON.stringify(body) },
    { timeoutMs: cfg.timeoutMs, label: cfg.label, signal: opts.signal }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${cfg.label} API error ${res.status}: ${text.slice(0, 2000)}`);
  }

  if (!opts.stream || !res.body) {
    const data = await res.json();
    const u = extractOpenAIUsage(data);
    if (u && opts.onUsage) opts.onUsage(u);
    return extractOpenAIText(data);
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
        const u = extractOpenAIUsage(parsed);
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
  /** Web pages the answer drew on (grounded replies only). */
  sources: WebSource[];
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
  const sources: WebSource[] = [];
  const onSources = (s: WebSource[]) => { sources.push(...s); };
  if (!isGeminiConfigured() && !isAnthropicConfigured()) {
    throw new Error("AI not configured: set GEMINI_API_KEY or ANTHROPIC_API_KEY");
  }
  const latestUser = [...opts.messages].reverse().find((m) => m.role === "user")?.text || "";
  const chatProviderSetting = await getAISetting("chat_provider", "hybrid");
  const forceProvider =
    chatProviderSetting === "gemini" ? "gemini"
    : chatProviderSetting === "anthropic" ? "anthropic"
    : undefined;
  const route = routeChatRequest({
    text: latestUser,
    webSearch: opts.webSearch,
    hasImages: (opts.images?.length || 0) > 0,
    forceProvider,
  });
  const system = opts.extraSystem
    ? BUILD_HELPER_SYSTEM + "\n\n" + opts.extraSystem
    : BUILD_HELPER_SYSTEM;

  const fail = (provider: AIProvider, err: any): never => {
    (err as any).aiProvider = provider;
    throw err;
  };

  // Anthropic route (owner override).
  if (route.provider === "anthropic") {
    try {
      const text = await callAnthropicChat({
        system,
        messages: opts.messages,
        maxTokens: opts.maxTokens,
        stream: opts.stream,
        onChunk: opts.onChunk,
        onUsage: opts.onUsage,
        signal: opts.signal,
        webSearch: route.grounded,
        onSources,
      });
      return { text, provider: "anthropic", grounded: route.grounded, sources: dedupeSources(sources) };
    } catch (err: any) {
      fail("anthropic", err);
    }
  }

  // Gemini route (primary: ordinary chat, grounded web research, vision).
  // On quota/rate-limit/server errors, fail over ONCE to Anthropic
  // (different provider = different quota bucket). Auth/config errors
  // (401/400) throw honestly — they indicate a bad key, not spent quota.
  try {
    const text = await buildHelperChat(
      opts.messages,
      opts.maxTokens,
      opts.onChunk,
      opts.extraSystem,
      opts.onUsage,
      opts.signal,
      route.grounded,
      onSources
    );
    return { text, provider: "gemini", grounded: route.grounded, sources: dedupeSources(sources) };
  } catch (err: any) {
    if (isAnthropicConfigured() && isGeminiFailoverable(err)) {
      console.warn(`[AI] Gemini failed (%s); failing over once to Anthropic`, String(err?.message || err).slice(0, 120));
      try {
        const text = await callAnthropicChat({
          system,
          messages: opts.messages,
          maxTokens: opts.maxTokens,
          stream: opts.stream,
          onChunk: opts.onChunk,
          onUsage: opts.onUsage,
          signal: opts.signal,
          // A grounded question keeps its web search on the fallback too.
          webSearch: route.grounded,
          onSources,
        });
        return { text, provider: "anthropic", grounded: route.grounded, sources: dedupeSources(sources) };
      } catch (anthropicErr: any) {
        fail("anthropic", anthropicErr);
      }
    }
    fail("gemini", err);
  }
}
