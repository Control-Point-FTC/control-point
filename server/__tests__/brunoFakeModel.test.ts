/**
 * Bruno end to end with a scripted model. The real server runs against a
 * stand-in for Gemini (GEMINI_API_BASE) that answers each request with the
 * next scripted reply and records what it was asked. This tests the server's
 * own handling of what models really do — a bare "Checking…", a proposal cut
 * off by the length cap — exactly, every time, without real AI calls.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";

vi.setConfig({ testTimeout: 60_000 });

/** One scripted model reply: text, or an HTTP error status. */
type Scripted = string | { status: number };

/** A stand-in for Gemini: replies in order and records each request. */
class FakeGemini {
  script: Scripted[] = [];
  requests: { path: string; body: any }[] = [];
  private server!: Server;
  base = "";
  async start() {
    this.server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        let body: any = null;
        try { body = JSON.parse(raw); } catch { /* keep null */ }
        this.requests.push({ path: req.url || "", body });
        const next = this.script.shift() ?? "(no scripted reply left)";
        if (typeof next !== "string") {
          res.writeHead(next.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { code: next.status, message: "scripted error" } }));
          return;
        }
        const usage = { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 };
        if ((req.url || "").includes("streamGenerateContent")) {
          // Streamed in a few pieces, like the real API.
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          const pieces = next.match(/[\s\S]{1,40}/g) || [""];
          pieces.forEach((p, i) => {
            const chunk = { candidates: [{ content: { parts: [{ text: p }] } }], ...(i === pieces.length - 1 ? { usageMetadata: usage } : {}) };
            res.write(`data: ${JSON.stringify(chunk)}\r\n\r\n`);
          });
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: next }] } }], usageMetadata: usage }));
        }
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => r()));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  stop() { return new Promise<void>((r) => this.server.close(() => r())); }
  /** The text of the last user turn the model was sent in request i. */
  lastUserText(i: number): string {
    const contents = this.requests[i]?.body?.contents || [];
    const user = [...contents].reverse().find((c: any) => c.role === "user");
    return (user?.parts || []).map((p: any) => p.text || "").join("");
  }
}

const gemini = new FakeGemini();
let t: TestServer;
let session = "";
beforeAll(async () => {
  await gemini.start();
  t = await startTestServer("cp-fakemodel-", { GEMINI_API_KEY: "fake", GEMINI_API_BASE: gemini.base, ANTHROPIC_API_KEY: "" });
  const team = await seedTeam(t.db, "Robo");
  session = await t.session(await seedMember(t.db, team, "Ada", "ada@fake.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); await gemini.stop(); });
beforeEach(() => { gemini.script = []; gemini.requests = []; });

/** Ask Bruno in a new chat the way the app does (streamed); returns what
 *  the member saw and what was saved. */
async function ask(question: string) {
  const chat = await t.post("/api/bruno/chats", {}, session);
  const chatId = chat.body.id;
  const headers = new Headers({ "Content-Type": "application/json", "X-CP-Client": "1" });
  withSession(headers, session);
  const res = await fetch(`${t.base}/api/ai/build-helper?stream=true`, { method: "POST", headers, body: JSON.stringify({ messages: [{ role: "user", text: question }], chatId }) });
  const shown = await res.text();
  const saved = await t.db.execute({ sql: "SELECT text FROM bruno_messages WHERE chat_id = ? AND role = 'model' ORDER BY id DESC LIMIT 1", args: [chatId] });
  return { status: res.status, shown, saved: String((saved.rows[0] as any)?.text ?? "") };
}

describe("a reply that only says Checking…", () => {
  it("is asked again, and the answer it then gives is shown and saved", async () => {
    gemini.script = ["Checking recent FTC event results in New Jersey...", "No New Jersey events have been played yet this season."];
    const r = await ask("What were the recent FTC event results in New Jersey?");
    expect(r.status).toBe(200);
    expect(gemini.requests).toHaveLength(2);
    expect(gemini.lastUserText(1)).toMatch(/didn't ask for a lookup/);
    expect(r.shown).toMatch(/No New Jersey events have been played yet this season\./);
    expect(r.saved).toMatch(/No New Jersey events have been played yet this season\./);
  });

  it("still nothing: the question is checked on the web and answered", async () => {
    gemini.script = ["Checking recent FTC event results in New Jersey...", "Checking again…", "FIRST Events lists no New Jersey events with results yet."];
    const r = await ask("What were the recent FTC event results in New Jersey?");
    expect(gemini.requests).toHaveLength(3);
    expect(gemini.requests[2].body.tools).toEqual([{ google_search: {} }]);
    expect(gemini.lastUserText(2)).toMatch(/Search the web now for: "What were the recent FTC event results in New Jersey\?"/);
    expect(r.saved).toMatch(/FIRST Events lists no New Jersey events with results yet\./);
  });

  it("never ends there: if every try says nothing, Bruno says so plainly", async () => {
    // Every scripted reply is only a progress line: anything else in the
    // reply has to come from the server's own note.
    gemini.script = ["Checking recent FTC event results in New Jersey...", "Checking again…", "Looking into it…"];
    const r = await ask("What were the recent FTC event results in New Jersey?");
    expect(gemini.requests).toHaveLength(3);
    const note = /I couldn't find anything current on that\. FIRST's event site \(https:\/\/ftc-events\.firstinspires\.org\) and FTC Scout \(https:\/\/ftcscout\.org\)/;
    expect(r.saved).toMatch(note);
    expect(r.shown).toMatch(note);
    // No line of the saved reply is anything but progress or the note.
    const lines = r.saved.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    expect(lines.filter((l) => !/^(Checking|Looking)\b/.test(l) && !note.test(l))).toEqual([]);
  });
});

describe("a proposal cut off by the length cap", () => {
  it("is finished with one more call, so the confirm card can read it", async () => {
    const full = '```event\n[{"title":"Build session","date":"2026-10-13","time":"18:00"},{"title":"Build session","date":"2026-10-15","time":"18:00"},{"title":"Build session","date":"2026-10-20","time":"18:00"}]\n```';
    gemini.script = [
      'Here are the build sessions:\n```event\n[{"title":"Build session","date":"2026-10-13","time":"18:00"},{"title":"Build ses',
      full,
    ];
    const r = await ask("Add build sessions on Oct 13, 15 and 20 at 6pm to the calendar.");
    expect(gemini.requests).toHaveLength(2);
    expect(gemini.lastUserText(1)).toMatch(/hit the length limit in the middle of its ```event block/);
    // The member's reply ends with a complete block holding all three sessions.
    const blocks = [...r.shown.matchAll(/```event\s*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    const readable = blocks.map((b) => { try { return JSON.parse(b); } catch { return null; } }).filter(Boolean);
    expect(readable.at(-1)).toHaveLength(3);
  });
});
