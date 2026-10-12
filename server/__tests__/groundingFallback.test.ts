/**
 * When Gemini's search allowance runs out (a 429 on a grounded request), a
 * question that needs current facts is answered by Claude's web search
 * rather than by Gemini without search. Without Claude set up, or if Claude
 * fails too, Gemini answers without search as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../ai", async (orig) => ({ ...(await orig<object>()), getAISetting: async (_key: string, fallback: string) => fallback }));

import { aiChat } from "../../ai-hybrid";

const env = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.GEMINI_API_KEY = "gemini-test";
  process.env.ANTHROPIC_API_KEY = "anthropic-test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const groundingSpent = () => new Response(JSON.stringify({ error: { code: 429, message: "Quota exceeded for google_search grounding", status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
const geminiSays = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } }), { status: 200 });
const claudeSays = (text: string) => new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }), { status: 200 });
const urlOf = (i: number) => String(fetchMock.mock.calls[i][0]);
const bodyOf = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);
const question = [{ role: "user" as const, text: "Is the Axon MAX servo in stock right now, and what's the price?" }];

describe("Gemini's search allowance spent", () => {
  it("Claude answers with its web search instead of Gemini answering unchecked", async () => {
    fetchMock.mockResolvedValueOnce(groundingSpent()).mockResolvedValueOnce(claudeSays("Sold out at goBILDA today."));
    const r = await aiChat({ messages: question, maxTokens: 512, stream: false });
    expect(urlOf(0)).toContain("generativelanguage");
    expect(bodyOf(0).tools).toEqual([{ google_search: {} }]);
    expect(urlOf(1)).toContain("anthropic");
    expect(bodyOf(1).tools?.map((t: any) => t.name)).toEqual(["web_search", "web_fetch"]);
    expect(r).toMatchObject({ text: "Sold out at goBILDA today.", provider: "anthropic", grounded: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("without Claude set up, Gemini answers without search (as before)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    fetchMock.mockResolvedValueOnce(groundingSpent()).mockResolvedValueOnce(geminiSays("From memory: usually about $100."));
    const r = await aiChat({ messages: question, maxTokens: 512, stream: false });
    expect(bodyOf(1).tools).toBeUndefined();
    expect(r).toMatchObject({ text: "From memory: usually about $100.", provider: "gemini" });
  });

  it("if Claude fails too, Gemini still answers without search rather than not at all", async () => {
    fetchMock
      .mockResolvedValueOnce(groundingSpent())
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), { status: 529 }))
      .mockResolvedValueOnce(geminiSays("From memory: usually about $100."));
    const r = await aiChat({ messages: question, maxTokens: 512, stream: false });
    expect(urlOf(2)).toContain("generativelanguage");
    expect(bodyOf(2).tools).toBeUndefined();
    expect(r).toMatchObject({ text: "From memory: usually about $100.", provider: "gemini", grounded: false });
  });

  it("a 429 on an ordinary (ungrounded) chat isn't treated as a search problem", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 })).mockResolvedValueOnce(claudeSays("Hi!"));
    const r = await aiChat({ messages: [{ role: "user", text: "hey bruno" }], maxTokens: 256, stream: false });
    expect(bodyOf(0).tools).toBeUndefined();
    expect(bodyOf(1)).not.toHaveProperty("tools");
    expect(r).toMatchObject({ text: "Hi!", provider: "anthropic", grounded: false });
  });
});
