/**
 * What Bruno is sent: no cap on what a member types or pastes, files as
 * Gemini inline data / Claude image and document blocks, the provider's own
 * request size as the only file limit, and a conversation that outgrows the
 * model's window losing its OLDEST turns first (never the current message).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setting = vi.hoisted(() => ({ provider: "hybrid" }));
vi.mock("../../ai", async (orig) => ({ ...(await orig<object>()), getAISetting: async (key: string, fallback: string) => (key === "chat_provider" ? setting.provider : fallback) }));

import { buildHelperChat } from "../../ai";
import { aiChat, anthropicMessage, routeChatRequest } from "../../ai-hybrid";
import { BrunoInputTooLarge, fitToRequestBytes, fitToWindow, providerTooLargeMessage, sanitizeBrunoAttachments } from "../brunoInput";
import { BRUNO_MAX_INLINE_FILES, BRUNO_REQUEST_LIMIT_BYTES, splitBrunoMessage, withTextFiles } from "../../src/utils/brunoFiles";

const env = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;
const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
const claudeOk = () => new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
const sentBody = (i = 0) => JSON.parse((fetchMock.mock.calls[i] as any)[1].body);

// Big enough to pass the validator (100+ base64 chars).
const b64 = (n = 400) => "QUJD".repeat(Math.ceil(n / 4)).slice(0, n);
const png = { mimeType: "image/png", data: b64(), name: "intake.png" };
const pdf = { mimeType: "application/pdf", data: b64(800), name: "game-manual.pdf" };

beforeEach(() => {
  setting.provider = "hybrid";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.GEMINI_INPUT_TOKENS;
  delete process.env.ANTHROPIC_INPUT_TOKENS;
});
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

describe("no paste limit", () => {
  it("a long pasted message reaches Gemini whole", async () => {
    process.env.GEMINI_API_KEY = "k";
    fetchMock.mockResolvedValue(geminiOk());
    const paste = "public class Drive { /* line */ }\n".repeat(6000); // ~200k chars
    await buildHelperChat([
      { role: "user", text: "earlier question" },
      { role: "model", text: "earlier answer ".repeat(500) },
      { role: "user", text: paste },
    ], 512, undefined, undefined, undefined, undefined, false);
    const body = sentBody();
    expect(body.contents.at(-1).parts[0].text).toBe(paste);
    // History isn't trimmed either while it fits the window.
    expect(body.contents).toHaveLength(3);
    expect(body.contents[1].parts[0].text).toHaveLength("earlier answer ".repeat(500).length);
  });

  it("text files travel inside the message, whole, and split back out for display", () => {
    const code = "x".repeat(50_000) + "\n<<<end bruno-file>>> inside the file\n";
    const text = withTextFiles("Why does this drift?", [{ name: "Drive.java", text: code }, { name: "log.csv", text: "t,v\n1,2" }]);
    const parts = splitBrunoMessage(`${text}\n\n📎 Attached: intake.png, game-manual.pdf`);
    expect(parts.body).toBe("Why does this drift?");
    expect(parts.textFiles).toEqual([{ name: "Drive.java", text: code }, { name: "log.csv", text: "t,v\n1,2" }]);
    expect(parts.attachedNames).toEqual(["intake.png", "game-manual.pdf"]);
  });
});

describe("the model's window", () => {
  it("drops the oldest history first and keeps the current message", () => {
    const msgs = [
      { role: "user" as const, text: "a".repeat(3000) }, // oldest
      { role: "model" as const, text: "b".repeat(3000) },
      { role: "user" as const, text: "c".repeat(3000) },
      { role: "model" as const, text: "d".repeat(3000) },
      { role: "user" as const, text: "e".repeat(3000) }, // current
    ];
    // ~1,000 tokens each: room for the current one and two more.
    const kept = fitToWindow(msgs, { inputTokens: 3100, fixedTokens: 0, outputTokens: 0 });
    expect(kept.map((m) => m.text[0])).toEqual(["c", "d", "e"]);
    // Never starts on a model turn.
    const odd = fitToWindow(msgs, { inputTokens: 2100, fixedTokens: 0, outputTokens: 0 });
    expect(odd.map((m) => m.text[0])).toEqual(["e"]);
  });

  it("history is trimmed oldest-first in the real Gemini request", async () => {
    process.env.GEMINI_API_KEY = "k";
    fetchMock.mockResolvedValue(geminiOk());
    // Window just big enough for the system prompt, the reply and the newest turns.
    const { BUILD_HELPER_SYSTEM } = await import("../../ai");
    process.env.GEMINI_INPUT_TOKENS = String(Math.ceil(BUILD_HELPER_SYSTEM.length / 3) + 512 + 2100);
    await buildHelperChat([
      { role: "user", text: "OLD ".repeat(1500) },
      { role: "model", text: "OLDER REPLY ".repeat(500) },
      { role: "user", text: "q".repeat(3000) },
      { role: "model", text: "r".repeat(600) },
      { role: "user", text: "current ".repeat(300) },
    ], 512, undefined, undefined, undefined, undefined, false);
    const texts = sentBody().contents.map((c: any) => c.parts[0].text as string);
    expect(texts.at(-1)).toBe("current ".repeat(300));
    expect(texts.some((t: string) => t.startsWith("OLD"))).toBe(false);
    expect(sentBody().contents[0].role).toBe("user");
  });

  it("a current message bigger than the window is refused with a clear error, never cut", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_INPUT_TOKENS = "50000";
    fetchMock.mockResolvedValue(geminiOk());
    const err = await buildHelperChat([{ role: "user", text: "z".repeat(400_000) }], 512, undefined, undefined, undefined, undefined, false).catch((e) => e);
    expect(err).toBeInstanceOf(BrunoInputTooLarge);
    expect(err.userMessage).toMatch(/too long for Bruno to read in one go/);
    expect(err.userMessage).toMatch(/Split it into smaller parts/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(providerTooLargeMessage(err)).toBe(err.userMessage);
  });

  it("is not failed over to Claude (it wouldn't fit there either)", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.GEMINI_INPUT_TOKENS = "50000";
    const err = await aiChat({ messages: [{ role: "user", text: "1500 ".repeat(100_000) }], maxTokens: 512, stream: false }).catch((e) => e);
    expect(providerTooLargeMessage(err)).toMatch(/too long/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("several files in one message", () => {
  it("become Gemini inline data parts on the current message", async () => {
    process.env.GEMINI_API_KEY = "k";
    delete process.env.ANTHROPIC_API_KEY;
    fetchMock.mockResolvedValue(geminiOk());
    const shot2 = { mimeType: "image/webp", data: b64(), name: "pit.webp" };
    await aiChat({ messages: [{ role: "user", text: "hi" }, { role: "model", text: "hey" }, { role: "user", text: "What's wrong here?" }], images: [png, shot2, pdf], maxTokens: 256, stream: false });
    const contents = sentBody().contents;
    expect(contents[0].parts).toEqual([{ text: "hi" }]); // earlier turns carry no files
    expect(contents.at(-1).parts).toEqual([
      { inlineData: { mimeType: "image/png", data: png.data } },
      { inlineData: { mimeType: "image/webp", data: shot2.data } },
      { inlineData: { mimeType: "application/pdf", data: pdf.data } },
      { text: "What's wrong here?" },
    ]);
  });

  it("become Claude image and document blocks (owner chose Claude)", async () => {
    setting.provider = "anthropic";
    process.env.GEMINI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "a";
    fetchMock.mockResolvedValue(claudeOk());
    await aiChat({ messages: [{ role: "user", text: "Compare these" }], images: [png, pdf], maxTokens: 256, stream: false });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/anthropic\.com\/v1\/messages$/);
    expect(sentBody().messages).toEqual([{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: png.data } },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.data }, title: "game-manual.pdf" },
        { type: "text", text: "Compare these" },
      ],
    }]);
  });

  it("go along when Gemini fails over to Claude", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "a";
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(claudeOk());
    const r = await aiChat({ messages: [{ role: "user", text: "Read this" }], images: [pdf], maxTokens: 256, stream: false });
    expect(r.provider).toBe("anthropic");
    expect(sentBody(1).messages[0].content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
  });

  it("route to Claude when only Claude is set up", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "a";
    expect(routeChatRequest({ text: "what is this", hasImages: true }).provider).toBe("anthropic");
  });

  it("files on an earlier user turn (a lookup follow-up) still reach the model and keep the vision route", async () => {
    process.env.GEMINI_API_KEY = "k";
    delete process.env.ANTHROPIC_API_KEY;
    fetchMock.mockResolvedValue(geminiOk());
    await aiChat({ messages: [{ role: "user", text: "Compare", attachments: [png] }, { role: "model", text: "Checking…" }, { role: "user", text: "Rows: …" }], webSearch: true, maxTokens: 256, stream: false });
    const body = sentBody();
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: png.data } });
    expect(body.tools).toEqual([{ google_search: {} }]); // an explicit web check still searches
  });

  it("the owner's Claude choice decides the window used", () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "a";
    expect(routeChatRequest({ text: "x", hasImages: true, forceProvider: "anthropic" }).provider).toBe("anthropic");
  });

  it("a message without files stays a plain string for Claude", () => {
    expect(anthropicMessage({ role: "model", text: "hello" })).toEqual({ role: "assistant", content: "hello" });
  });
});

describe("the provider's size limit", () => {
  it("accepts many files up to the provider's request size", () => {
    const files = Array.from({ length: 30 }, (_, i) => ({ mimeType: "image/jpeg", data: b64(1000), name: `shot-${i}.jpg` }));
    const r = sanitizeBrunoAttachments(files, [pdf]);
    expect(r.error).toBeUndefined();
    expect(r.attachments).toHaveLength(31);
  });

  it("over it: a clear message, no files", () => {
    const big = { mimeType: "application/pdf", data: b64(BRUNO_REQUEST_LIMIT_BYTES - 1000), name: "huge.pdf" };
    const r = sanitizeBrunoAttachments([png], [big], 5000);
    expect(r.attachments).toEqual([]);
    expect(r.error).toMatch(/more than the 20 MB the AI provider accepts in one message/);
  });

  it("more images than Claude reads in one request: a clear message", () => {
    const many = Array.from({ length: BRUNO_MAX_INLINE_FILES + 1 }, () => png);
    expect(sanitizeBrunoAttachments(many, []).error).toMatch(/up to 100 in one message/);
  });

  it("the request size drops the oldest turns first, never the current message", () => {
    const msgs = [
      { role: "user", text: "a".repeat(900) }, { role: "model", text: "b".repeat(900) },
      { role: "user", text: "c".repeat(900) }, { role: "model", text: "d".repeat(100) },
      { role: "user", text: "now" },
    ];
    expect(fitToRequestBytes(msgs, [], 2100).messages.map((m) => m.text[0])).toEqual(["c", "d", "n"]);
    const r = fitToRequestBytes([{ role: "user", text: "z".repeat(3000) }], [], 2100);
    expect(r.error).toMatch(/more than the 20 MB|more than the/);
  });

  it("drops what isn't an image or PDF", () => {
    const r = sanitizeBrunoAttachments([{ mimeType: "text/html", data: b64() }, { mimeType: "image/png", data: "not base64!" }], [{ mimeType: "image/png", data: b64() }]);
    expect(r.attachments).toEqual([]);
  });

  it("a provider's own too-large error becomes a plain message", () => {
    expect(providerTooLargeMessage(new Error("Gemini API error 400: The input token count (1200000) exceeds the maximum number of tokens allowed"))).toMatch(/too long/);
    expect(providerTooLargeMessage(new Error("Anthropic API error 413: request_too_large"))).toMatch(/more than the AI provider accepts/);
    expect(providerTooLargeMessage(new Error("Gemini API error 503"))).toBeNull();
  });
});
