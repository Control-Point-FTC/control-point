// What Bruno can be sent in one request: the model's real input window and
// the provider's request size, nothing smaller. There is no cap on what a
// member types or pastes. When a conversation outgrows the window, the
// OLDEST turns are dropped first; the member's current message is never cut.
// If that message alone is more than the model can read, the request fails
// with a clear message instead of being silently truncated.

import {
  BRUNO_IMAGE_TYPES,
  BRUNO_MAX_INLINE_FILES,
  BRUNO_REQUEST_LIMIT_BYTES,
  formatBytes,
  safeFileName,
  tooLargeMessage,
} from "../src/utils/brunoFiles.js";

/** A file sent to the model as inline data (an image or a PDF). */
export interface InlineAttachment {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
  name?: string;
}

/** Input windows (tokens). Gemini 3.5 Flash-Lite and Claude Sonnet 5.5 both
 *  read about a million tokens; env overrides follow a model change. */
export const GEMINI_INPUT_TOKENS = 1_048_576;
export const ANTHROPIC_INPUT_TOKENS = 1_000_000;
export function geminiInputTokens(): number {
  const n = parseInt(process.env.GEMINI_INPUT_TOKENS || "", 10);
  return Number.isFinite(n) && n > 0 ? n : GEMINI_INPUT_TOKENS;
}
export function anthropicInputTokens(): number {
  const n = parseInt(process.env.ANTHROPIC_INPUT_TOKENS || "", 10);
  return Number.isFinite(n) && n > 0 ? n : ANTHROPIC_INPUT_TOKENS;
}

/** A deliberately high estimate (3 characters a token; code and non-English
 *  text run denser than prose), so a request that passes this check fits. */
export function estimateTokens(text: string): number {
  return Math.ceil(String(text || "").length / 3);
}

/** Tokens an inline file costs: Claude bills a 1600px image at about 1,600
 *  tokens and a PDF page at up to ~3,000 (text plus page image); a page is
 *  taken as ~50 KB of PDF. Gemini charges less for both. */
export function attachmentTokens(a: InlineAttachment): number {
  const bytes = Math.floor((a.data?.length || 0) * 3 / 4);
  if (a.mimeType === "application/pdf") return Math.max(1, Math.ceil(bytes / 50_000)) * 3000;
  return 1600;
}

/** Thrown when the member's own message can't fit the model's window, or
 *  the files are more than one request can carry. `userMessage` is safe to
 *  show; `status` is the HTTP status to answer with. */
export class BrunoInputTooLarge extends Error {
  status = 413;
  userMessage: string;
  constructor(userMessage: string) {
    super(`Bruno input too large: ${userMessage}`);
    this.name = "BrunoInputTooLarge";
    this.userMessage = userMessage;
  }
}
export function isInputTooLarge(err: any): err is BrunoInputTooLarge {
  return !!err && (err instanceof BrunoInputTooLarge || err.name === "BrunoInputTooLarge");
}

export function messageTooLongText(tokens: number, limit: number): string {
  const k = (n: number) => `${Math.round(n / 1000).toLocaleString("en-US")}k`;
  return `That message is too long for Bruno to read in one go (about ${k(tokens)} tokens; the model reads at most ${k(limit)}). Split it into smaller parts and send them one at a time.`;
}

export interface FitMessage {
  role: "user" | "model";
  text: string;
  attachments?: InlineAttachment[];
}

/**
 * Fit a conversation into a model's input window. `fixedTokens` covers the
 * system prompt; `outputTokens` the reply. Drops the oldest turns first and
 * never touches the last message (the member's current one). Throws
 * BrunoInputTooLarge when that message alone doesn't fit. The result always
 * starts with a user turn (both APIs expect one).
 */
export function fitToWindow<T extends FitMessage>(messages: T[], opts: { inputTokens: number; fixedTokens: number; outputTokens: number }): T[] {
  if (!messages.length) return messages;
  const cost = (m: T) => estimateTokens(m.text) + (m.attachments || []).reduce((n, a) => n + attachmentTokens(a), 0) + 8;
  let budget = opts.inputTokens - opts.fixedTokens - opts.outputTokens;
  const last = messages[messages.length - 1];
  const lastCost = cost(last);
  if (lastCost > budget) {
    throw new BrunoInputTooLarge(messageTooLongText(lastCost, Math.max(0, opts.inputTokens - opts.fixedTokens - opts.outputTokens)));
  }
  budget -= lastCost;
  const kept: T[] = [last];
  for (let i = messages.length - 2; i >= 0; i--) {
    const c = cost(messages[i]);
    if (c > budget) break; // everything older goes too: history stays contiguous
    kept.unshift(messages[i]);
    budget -= c;
  }
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}

/**
 * Validate the images and PDFs a member attached. Returns them in order with
 * clean names, or `error` (shown to the member) when they are more than the
 * provider takes in one request. Malformed entries are dropped. `textBytes`
 * is the rest of the request (the messages), which counts toward the limit.
 */
export function sanitizeBrunoAttachments(images: any, pdfs: any, textBytes = 0): { attachments: InlineAttachment[]; error?: string } {
  const out: InlineAttachment[] = [];
  const add = (raw: any, kind: "image" | "pdf", i: number) => {
    try {
      let mimeType = String(raw?.mimeType || "").toLowerCase();
      if (mimeType === "image/jpg") mimeType = "image/jpeg";
      const data = String(raw?.data || "").replace(/^data:[\w/+.-]+;base64,/, "");
      if (kind === "image" && !(BRUNO_IMAGE_TYPES as readonly string[]).includes(mimeType)) return;
      if (kind === "pdf" && mimeType !== "application/pdf") return;
      if (data.length < 100 || !/^[A-Za-z0-9+/=]+$/.test(data)) return;
      const fallback = kind === "pdf" ? `document-${i + 1}.pdf` : `image-${i + 1}.${mimeType.split("/")[1] || "png"}`;
      out.push({ mimeType, data, name: safeFileName(String(raw?.name || "") || fallback) });
    } catch { /* skip malformed entries */ }
  };
  (Array.isArray(images) ? images : []).forEach((im, i) => add(im, "image", i));
  (Array.isArray(pdfs) ? pdfs : []).forEach((p, i) => add(p, "pdf", i));
  if (out.length > BRUNO_MAX_INLINE_FILES) {
    return { attachments: [], error: `That's ${out.length} images and PDFs; Bruno can read up to ${BRUNO_MAX_INLINE_FILES} in one message. Send the rest in your next message.` };
  }
  const total = out.reduce((n, a) => n + a.data.length, 0) + textBytes;
  if (total > BRUNO_REQUEST_LIMIT_BYTES) return { attachments: [], error: tooLargeMessage(total) };
  return { attachments: out };
}

/**
 * Fit a conversation into the provider's request size (UTF-8 text plus the
 * current message's files, `reservedBytes` for the system prompt). Drops the
 * oldest turns first and never touches the last message; if that message and
 * its files alone are too big, returns `error` (shown to the member).
 */
export function fitToRequestBytes<T extends { role: string; text: string }>(messages: T[], files: InlineAttachment[], limit: number, reservedBytes = 0): { messages: T[]; error?: string } {
  if (!messages.length) return { messages };
  const size = (m: T) => Buffer.byteLength(m.text || "", "utf8");
  const fileBytes = files.reduce((n, a) => n + a.data.length, 0);
  let budget = limit - reservedBytes - fileBytes - size(messages[messages.length - 1]);
  if (budget < 0) return { messages: [], error: tooLargeMessage(limit - budget) };
  const kept: T[] = [messages[messages.length - 1]];
  for (let i = messages.length - 2; i >= 0; i--) {
    const s = size(messages[i]);
    if (s > budget) break; // everything older goes too: history stays contiguous
    kept.unshift(messages[i]);
    budget -= s;
  }
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return { messages: kept };
}

/** Decoded size of a base64 attachment, for display. */
export function attachmentBytes(a: InlineAttachment): number {
  const pad = a.data.endsWith("==") ? 2 : a.data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(a.data.length * 3 / 4) - pad);
}

export { formatBytes };

/**
 * What to tell the member when a provider refused the request for its size
 * (our estimate passed but the provider counted more), or null for any other
 * failure. Covers Gemini's token-count 400 and payload 413, and Claude's
 * "prompt is too long" and request_too_large.
 */
export function providerTooLargeMessage(err: any): string | null {
  if (isInputTooLarge(err)) return err.userMessage;
  const msg = String(err?.message || err || "");
  if (/API error 413|request_too_large|payload size exceeds|request payload size/i.test(msg)) {
    return `Those files are more than the AI provider accepts in one message. Send some of them now and the rest in your next message.`;
  }
  if (/exceeds the maximum number of tokens|input token count|prompt is too long|context.{0,20}(length|window)/i.test(msg)) {
    return "That message is too long for Bruno to read in one go. Split it into smaller parts and send them one at a time.";
  }
  return null;
}
