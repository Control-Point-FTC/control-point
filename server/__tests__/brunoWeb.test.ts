/**
 * Bruno web access (V3.5 phase 4d): price/stock/fact-check questions are
 * grounded, Bruno can ask for a web check itself (```lookup {"kind":"web"}),
 * Claude gets its server-side web tools when grounded, and the pages an
 * answer used are listed under it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../ai", async (orig) => ({ ...(await orig<object>()), getAISetting: async (key: string, fallback: string) => (key === "chat_provider" ? "anthropic" : fallback) }));

import { aiChat, needsWebSearch, routeChatRequest } from "../../ai-hybrid";
import { anthropicSources, geminiSources, sourcesFooter } from "../webSources";
import { fromMarkdown } from "mdast-util-from-markdown";
import { extractLookupBlocks, followUpPrompt, runLookups } from "../brunoLookup";

const sse = (events: any[], every = 31) => {
  const bytes = new TextEncoder().encode(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""));
  return new Response(new ReadableStream({
    start(c) { for (let i = 0; i < bytes.length; i += every) c.enqueue(bytes.slice(i, i + every)); c.close(); },
  }), { status: 200, headers: { "content-type": "text/event-stream" } });
};
const env = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.ANTHROPIC_MODEL;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });
const bodyOf = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);

describe("which questions search the web", () => {
  it("prices, stock and fact-checks are grounded", () => {
    for (const q of [
      "how much does a goBILDA servo cost?",
      "is the REV control hub out of stock?",
      "where can I buy 8mm REX shaft",
      "can you fact-check that?",
      "is that still true for this season?",
      "is the Axon Max still available?",
      "cheapest mecanum wheels for FTC",
    ]) expect(needsWebSearch(q), q).toBe(true);
  });
  it("Gemini searches by default; Claude searches when the owner chose it or Gemini isn't set up", () => {
    process.env.GEMINI_API_KEY = "g";
    expect(routeChatRequest({ text: "price of a REV servo" })).toMatchObject({ provider: "gemini", grounded: true });
    expect(routeChatRequest({ text: "price of a REV servo", forceProvider: "anthropic" })).toMatchObject({ provider: "anthropic", grounded: true });
    delete process.env.GEMINI_API_KEY;
    expect(routeChatRequest({ text: "price of a REV servo" })).toMatchObject({ provider: "anthropic", grounded: true });
  });
  it("ordinary chat still isn't", () => {
    for (const q of ["hey bruno how are you", "summarize these build notes", "explain how a PID loop works"]) expect(needsWebSearch(q), q).toBe(false);
  });
});

describe("Claude with web tools", () => {
  it("a grounded question sends the web tools and reports cited pages", async () => {
    fetchMock.mockResolvedValue(sse([
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "s1", name: "web_search", input: {} } },
      { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "s1", content: [
        { type: "web_search_result", url: "https://www.gobilda.com/2000-series-dual-mode-servo/", title: "2000 Series Dual Mode Servo" },
        { type: "web_search_result", url: "https://example.com/forum", title: "Forum" },
      ] } },
      { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "$39.99 at goBILDA." } },
      { type: "content_block_delta", index: 2, delta: { type: "citations_delta", citation: { type: "web_search_result_location", url: "https://www.gobilda.com/2000-series-dual-mode-servo/", title: "2000 Series Dual Mode Servo", cited_text: "$39.99" } } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } },
    ]));
    const r = await aiChat({ messages: [{ role: "user", text: "how much does a goBILDA servo cost?" }], maxTokens: 1024, stream: true, onChunk: () => {} });
    expect(r).toMatchObject({ text: "$39.99 at goBILDA.", grounded: true, sources: [{ url: "https://www.gobilda.com/2000-series-dual-mode-servo/", title: "2000 Series Dual Mode Servo" }] });
    expect(bodyOf(0).tools).toEqual([
      { type: "web_search_20260209", name: "web_search", max_uses: 3 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
    ]);
  });

  it("ordinary chat sends no tools", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "Hi!" }], stop_reason: "end_turn" }), { status: 200 }));
    const r = await aiChat({ messages: [{ role: "user", text: "hey bruno" }], maxTokens: 256, stream: false });
    expect(r.sources).toEqual([]);
    expect(bodyOf(0)).not.toHaveProperty("tools");
  });

  it("web tools turned off for the org: retried once without them", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "web_search is not enabled for this organization" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ type: "text", text: "From memory: about $40." }], stop_reason: "end_turn" }), { status: 200 }));
    const r = await aiChat({ messages: [{ role: "user", text: "price of a REV servo" }], maxTokens: 256, stream: false });
    expect(r.text).toBe("From memory: about $40.");
    expect(bodyOf(0)).toHaveProperty("tools");
    expect(bodyOf(1)).not.toHaveProperty("tools");
  });

  it("uncited search results fall back to the top three pages (non-streamed)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: [
      { type: "web_search_tool_result", content: [1, 2, 3, 4].map((i) => ({ type: "web_search_result", url: `https://s${i}.example/`, title: `S${i}` })) },
      { type: "text", text: "Here's what I found." },
    ], stop_reason: "end_turn" }), { status: 200 }));
    const r = await aiChat({ messages: [{ role: "user", text: "is the Axon Max still available?" }], maxTokens: 256, stream: false });
    expect(r.sources.map((s) => s.title)).toEqual(["S1", "S2", "S3"]);
  });
});

describe("fetched pages", () => {
  const fetchBlock = { type: "web_fetch_tool_result", tool_use_id: "f1", content: { type: "web_fetch_result", url: "https://www.revrobotics.com/rev-41-1600/", content: { type: "document", title: "Smart Robot Servo", source: { type: "text", data: "…" } } } };

  it("a fetch-only answer lists the page it read (streamed)", async () => {
    fetchMock.mockResolvedValue(sse([
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "f1", name: "web_fetch", input: { url: "https://www.revrobotics.com/rev-41-1600/" } } },
      { type: "content_block_start", index: 1, content_block: fetchBlock },
      { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "It's in stock." } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
    ]));
    const r = await aiChat({ messages: [{ role: "user", text: "is the REV smart servo in stock? https://www.revrobotics.com/rev-41-1600/" }], maxTokens: 256, stream: true, onChunk: () => {} });
    expect(r.sources).toEqual([{ url: "https://www.revrobotics.com/rev-41-1600/", title: "Smart Robot Servo" }]);
    expect(sourcesFooter(r.sources)).toContain("[Smart Robot Servo](https://www.revrobotics.com/rev-41-1600/)");
  });

  it("a fetch-only answer lists the page it read (non-streamed)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: [fetchBlock, { type: "text", text: "It's in stock." }], stop_reason: "end_turn" }), { status: 200 }));
    const r = await aiChat({ messages: [{ role: "user", text: "is the REV smart servo in stock?" }], maxTokens: 256, stream: false });
    expect(r.sources).toEqual([{ url: "https://www.revrobotics.com/rev-41-1600/", title: "Smart Robot Servo" }]);
  });
});

describe("source helpers", () => {
  it("reads Gemini grounding chunks, ignoring non-web links", () => {
    expect(geminiSources({ candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "revrobotics.com" } },
      { web: { uri: "javascript:alert(1)", title: "bad" } },
      { retrievedContext: {} },
    ] } }] })).toEqual([{ url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "revrobotics.com" }]);
    expect(geminiSources({})).toEqual([]);
  });

  it("reads whole text blocks' citations", () => {
    expect(anthropicSources({ type: "text", text: "x", citations: [{ url: "https://a.example/", title: "A" }] }).cited).toEqual([{ url: "https://a.example/", title: "A" }]);
  });

  it("the footer dedupes, caps at five and can't break the markdown", () => {
    const many = [1, 2, 3, 4, 5, 6].map((i) => ({ url: `https://s${i}.example/`, title: `S${i}` }));
    const f = sourcesFooter([many[0], ...many]);
    expect(f.match(/\]\(/g)).toHaveLength(5);
    expect(f.startsWith("\n\n_Sources: [S1](https://s1.example/)")).toBe(true);
    // Both parentheses are encoded, so the whole URL stays one markdown link.
    const odd = sourcesFooter([{ url: "https://x.example/a_(b)", title: "Bad [title](evil)" }]);
    expect(odd).toBe("\n\n_Sources: [Bad \\[title\\]\\(evil\\)](https://x.example/a_%28b%29)_");
    const link: any = (fromMarkdown(odd) as any).children[0].children[0].children.find((n: any) => n.type === "link");
    expect(link.url).toBe("https://x.example/a_%28b%29");
    expect(sourcesFooter([{ url: "https://www.gobilda.com/x", title: "" }])).toContain("[gobilda.com]");
    expect(sourcesFooter([])).toBe("");
  });
});

describe("source footer markdown", () => {
  const links = (md: string) => {
    const out: { text: string; url: string }[] = [];
    const walk = (n: any) => {
      if (n.type === "link") out.push({ text: n.children.map((c: any) => c.value ?? "").join(""), url: n.url });
      (n.children || []).forEach(walk);
    };
    walk(fromMarkdown(md));
    return out;
  };

  it("titles with backslashes, brackets, underscores or a cut at 60 characters stay one link each", () => {
    const md = sourcesFooter([
      { url: "https://a.example/x", title: "C:\\path\\" },
      { url: "https://b.example/y", title: `${"x".repeat(59)}\\tail` },
      { url: "https://c.example/z_(1)", title: "snake_case [beta] *now*" },
    ]);
    expect(links(md)).toEqual([
      { text: "C:\\path\\", url: "https://a.example/x" },
      { text: `${"x".repeat(59)}\\`, url: "https://b.example/y" },
      { text: "snake_case [beta] *now*", url: "https://c.example/z_%281%29" },
    ]);
  });
});

describe("Bruno's own web check", () => {
  it("a web lookup needs a query and sits alongside data lookups", () => {
    const r = extractLookupBlocks('Checking…\n```lookup\n[{"kind":"web","query":"REV servo price"},{"kind":"web"},{"kind":"tasks","status":"open"}]\n```');
    expect(r.queries).toEqual([{ kind: "web", query: "REV servo price" }, { kind: "tasks", status: "open" }]);
    expect(r.text).toBe("Checking…");
  });

  it("web checks never hit the database", async () => {
    const db = vi.fn(async () => []);
    expect(await runLookups(db, 1, "UTC", [{ kind: "web", query: "x" }])).toBe("");
    expect(db).not.toHaveBeenCalled();
  });

  it("the second-pass prompt asks for a web search with store and date", () => {
    const p = followUpPrompt("", [{ kind: "web", query: "goBILDA servo price" }]);
    expect(p).toContain('Search the web now for: "goBILDA servo price".');
    expect(p).toContain("as of today");
    expect(p).not.toContain("team's own data");
    const both = followUpPrompt("Lookup: tasks — 1 found\n#1 x", [{ kind: "tasks" }, { kind: "web", query: "y" }]);
    expect(both).toContain("team's own data");
    expect(both).toContain('"y"');
  });
});
