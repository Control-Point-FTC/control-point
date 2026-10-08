/** Lookup results reach Gemini whole: a message's own maxChars lifts the
 *  2,000-char cap, and its length doesn't push the question out of history. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildHelperChat } from "../../ai";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

describe("Gemini history caps", () => {
  it("keeps a long lookup-results message and the question before it", async () => {
    process.env.GEMINI_API_KEY = "k";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const rows = `Lookup: budget — 60 shown, MORE matched\n${"x".repeat(11000)}\nTotal of all 61 matching entries`;
    await buildHelperChat([
      { role: "user", text: "q".repeat(1500) },
      { role: "user", text: "What did we spend in September?" },
      { role: "model", text: "Checking…" },
      { role: "user", text: rows, maxChars: 14000 },
      { role: "user", text: "y".repeat(3000) },
    ], 512, undefined, undefined, undefined, undefined, false);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    const texts = body.contents.map((c: any) => c.parts[0].text);
    expect(texts).toContain(rows);
    expect(texts).toContain("What did we spend in September?");
    expect(texts.at(-1)).toHaveLength(2000); // ordinary messages keep the 2,000 cap
  });
});
