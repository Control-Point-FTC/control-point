/**
 * Bruno end to end (real server, scripted Gemini): a long paste is sent and
 * saved whole; several files reach the model as inline parts and are kept
 * with the message (only people who can see the chat can open them); files
 * past the provider's request size get a clear 413, nothing is saved.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";
import { withTextFiles } from "../../src/utils/brunoFiles";

vi.setConfig({ testTimeout: 60_000 });

/** A stand-in for Gemini that answers "ok" and records each request. */
class FakeGemini {
  requests: any[] = [];
  script: string[] = [];
  private server!: Server;
  base = "";
  async start() {
    this.server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        try { this.requests.push(JSON.parse(raw)); } catch { this.requests.push(null); }
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const text = this.script.shift() ?? "Read them all.";
        res.end(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\r\n\r\n`);
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => r()));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  stop() { return new Promise<void>((r) => this.server.close(() => r())); }
}

const gemini = new FakeGemini();
let t: TestServer;
let ada = "";
let ben = "";
beforeAll(async () => {
  await gemini.start();
  t = await startTestServer("cp-brunofiles-", { GEMINI_API_KEY: "fake", GEMINI_API_BASE: gemini.base, ANTHROPIC_API_KEY: "" });
  const team = await seedTeam(t.db, "Robo");
  ada = await t.session(await seedMember(t.db, team, "Ada", "ada@files.test", "admin"));
  ben = await t.session(await seedMember(t.db, team, "Ben", "ben@files.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); await gemini.stop(); });
beforeEach(() => { gemini.requests = []; gemini.script = []; });

async function send(body: any, session = ada) {
  const chat = await t.post("/api/bruno/chats", {}, session);
  const headers = withSession(new Headers({ "Content-Type": "application/json" }), session);
  const res = await fetch(`${t.base}/api/ai/build-helper?stream=true`, { method: "POST", headers, body: JSON.stringify({ chatId: chat.body.id, ...body }) });
  return { chatId: chat.body.id as number, status: res.status, text: await res.text() };
}
const b64 = (bytes: number) => Buffer.alloc(bytes, 7).toString("base64");

describe("no paste limit", () => {
  it("a 100,000-character paste reaches the model and the chat whole", async () => {
    const paste = "telemetry.addData(\"x\", x);\n".repeat(4000);
    const r = await send({ messages: [{ role: "user", text: paste }] });
    expect(r.status).toBe(200);
    const sent = gemini.requests[0].contents.at(-1).parts.at(-1).text;
    expect(sent).toBe(paste);
    const saved = await t.api(`/api/bruno/chats/${r.chatId}`, { session: ada });
    expect(saved.body.messages[0].text).toBe(paste);
  });
});

describe("history and the provider's request size", () => {
  it("an earlier long paste never blocks a message with files: the oldest turns go first", async () => {
    const old = "y".repeat(2 * 1024 * 1024);
    const pdf = b64(14 * 1024 * 1024); // ~18.7 MB as base64
    const r = await send({
      messages: [{ role: "user", text: old }, { role: "model", text: "ok" }, { role: "user", text: "Now read this" }],
      pdfs: [{ mimeType: "application/pdf", data: pdf, name: "manual.pdf" }],
    });
    expect(r.status).toBe(200);
    const contents = gemini.requests[0].contents;
    expect(contents).toHaveLength(1); // the 2 MB paste no longer fits beside the PDF
    expect(contents[0].parts.at(-1).text).toBe("Now read this");
    expect(contents[0].parts[0].inlineData.mimeType).toBe("application/pdf");
  });
});

describe("several files in one message", () => {
  it("stay with the message for the lookup follow-up call", async () => {
    gemini.script = ["Checking your tasks…\n```lookup\n{\"kind\":\"tasks\"}\n```", "Compared."];
    const png = b64(3000);
    const r = await send({ messages: [{ role: "user", text: "Compare this to our tasks" }], images: [{ mimeType: "image/png", data: png, name: "list.png" }] });
    expect(r.status).toBe(200);
    expect(gemini.requests).toHaveLength(2);
    const withFile = (i: number) => gemini.requests[i].contents.some((c: any) => c.parts.some((p: any) => p.inlineData?.data === png));
    expect(withFile(0)).toBe(true);
    expect(withFile(1)).toBe(true);
  });

  it("reach the model as inline parts, are saved with the message, and only the chat's viewers can open them", async () => {
    const png = b64(3000), jpg = b64(2000), pdf = b64(5000);
    const text = withTextFiles("What's wrong with our intake?", [{ name: "Intake.java", text: "class Intake {}" }, { name: "notes.md", text: "# notes" }]);
    const r = await send({
      messages: [{ role: "user", text }],
      images: [{ mimeType: "image/png", data: png, name: "jam.png" }, { mimeType: "image/jpeg", data: jpg, name: "side.jpg" }],
      pdfs: [{ mimeType: "application/pdf", data: pdf, name: "intake-spec.pdf" }],
    });
    expect(r.status).toBe(200);
    const parts = gemini.requests[0].contents.at(-1).parts;
    expect(parts.slice(0, 3)).toEqual([
      { inlineData: { mimeType: "image/png", data: png } },
      { inlineData: { mimeType: "image/jpeg", data: jpg } },
      { inlineData: { mimeType: "application/pdf", data: pdf } },
    ]);
    // The text files are in the text, whole.
    expect(parts[3].text).toContain('<<<bruno-file name="Intake.java">>>\nclass Intake {}\n<<<end bruno-file>>>');

    const chat = await t.api(`/api/bruno/chats/${r.chatId}`, { session: ada });
    const msg = chat.body.messages[0];
    expect(msg.text).toMatch(/📎 Attached: jam\.png, side\.jpg, intake-spec\.pdf$/);
    expect(msg.attachments.map((a: any) => [a.name, a.mimeType, a.size])).toEqual([
      ["jam.png", "image/png", 3000], ["side.jpg", "image/jpeg", 2000], ["intake-spec.pdf", "application/pdf", 5000],
    ]);
    const own = await fetch(`${t.base}${msg.attachments[2].url}`, { headers: withSession(new Headers(), ada) });
    expect(own.status).toBe(200);
    expect(Buffer.from(await own.arrayBuffer()).toString("base64")).toBe(pdf);
    // A private chat's files are not for teammates…
    const other = await fetch(`${t.base}${msg.attachments[0].url}`, { headers: withSession(new Headers(), ben) });
    expect(other.status).toBe(403);
    // …until the chat is shared.
    await t.patch(`/api/bruno/chats/${r.chatId}`, { is_public: true }, ada);
    const shared = await fetch(`${t.base}${msg.attachments[0].url}`, { headers: withSession(new Headers(), ben) });
    expect(shared.status).toBe(200);

    // Deleting the chat deletes its files.
    await t.api(`/api/bruno/chats/${r.chatId}`, { method: "DELETE", session: ada });
    const left = await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM stored_files WHERE kind = 'bruno' AND id IN (?, ?, ?)", args: msg.attachments.map((a: any) => a.id) });
    expect(Number((left.rows[0] as any).n)).toBe(0);
  });

  it("past the provider's request size: a clear 413, no model call, nothing saved", async () => {
    const r = await send({
      messages: [{ role: "user", text: "Read all of these" }],
      pdfs: [{ mimeType: "application/pdf", data: b64(8 * 1024 * 1024), name: "a.pdf" }, { mimeType: "application/pdf", data: b64(8 * 1024 * 1024), name: "b.pdf" }],
    });
    expect(r.status).toBe(413);
    expect(JSON.parse(r.text).error).toMatch(/more than the 20 MB the AI provider accepts in one message/);
    expect(gemini.requests).toHaveLength(0);
    const saved = await t.api(`/api/bruno/chats/${r.chatId}`, { session: ada });
    expect(saved.body.messages).toEqual([]);
  });
});
