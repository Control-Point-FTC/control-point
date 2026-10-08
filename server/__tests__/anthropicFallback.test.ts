/**
 * Bruno's Claude provider: claude-sonnet-4-20250514 was retired (404s), so the
 * default is claude-sonnet-5-5. Streamed requests must ask for a stream (the
 * reader parses SSE), effort is set explicitly, server-side fallback is on,
 * and a refusal (stop_reason "refusal") never comes back as an empty reply.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../ai", async (orig) => ({ ...(await orig<object>()), getAISetting: async (key: string, fallback: string) => (key === "chat_provider" ? "anthropic" : fallback) }));

import { aiChat, anthropicModel, ANTHROPIC_REFUSAL_MSG } from "../../ai-hybrid";

const sse = (events: any[]) => {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
};
const env = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.ANTHROPIC_EFFORT;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(init.body) };
};

describe("Bruno's Claude provider", () => {
  it("defaults to claude-sonnet-5-5 (ANTHROPIC_MODEL still overrides)", () => {
    expect(anthropicModel()).toBe("claude-sonnet-5-5");
    process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
    expect(anthropicModel()).toBe("claude-opus-5-5");
  });

  it("a streamed reply asks for a stream and arrives chunk by chunk", async () => {
    fetchMock.mockResolvedValue(sse([
      { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello " } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "team" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
    ]));
    const chunks: string[] = [];
    const r = await aiChat({ messages: [{ role: "user", text: "hi" }], maxTokens: 1024, stream: true, onChunk: (c) => chunks.push(c) });
    expect(r).toMatchObject({ text: "Hello team", provider: "anthropic" });
    expect(chunks).toEqual(["Hello ", "team"]);
    const req = lastRequest();
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.body).toMatchObject({ model: "claude-sonnet-5-5", stream: true, output_config: { effort: "low" }, fallbacks: "default", max_tokens: 1024 });
    expect(req.body).not.toHaveProperty("thinking");
    expect(req.body).not.toHaveProperty("temperature");
    expect(req.headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
  });

  it("a non-streamed reply reads text blocks only and honours ANTHROPIC_EFFORT", async () => {
    process.env.ANTHROPIC_EFFORT = "medium";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Done." }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 },
    }), { status: 200 }));
    const r = await aiChat({ messages: [{ role: "user", text: "hi" }], maxTokens: 512, stream: false });
    expect(r.text).toBe("Done.");
    expect(lastRequest().body).toMatchObject({ stream: false, output_config: { effort: "medium" } });
  });

  it("a refusal says so instead of an empty reply", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } }), { status: 200 }));
    expect((await aiChat({ messages: [{ role: "user", text: "x" }], maxTokens: 512, stream: false })).text).toBe(ANTHROPIC_REFUSAL_MSG);
    fetchMock.mockResolvedValueOnce(sse([{ type: "message_delta", delta: { stop_reason: "refusal" }, usage: { output_tokens: 0 } }]));
    const chunks: string[] = [];
    const r = await aiChat({ messages: [{ role: "user", text: "x" }], maxTokens: 512, stream: true, onChunk: (c) => chunks.push(c) });
    expect(r.text).toBe(ANTHROPIC_REFUSAL_MSG);
    expect(chunks).toEqual([ANTHROPIC_REFUSAL_MSG]);
  });
});
