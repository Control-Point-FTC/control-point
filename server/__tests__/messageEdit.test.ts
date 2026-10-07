// Authors can edit their own chat messages (marked "edited", everyone sees
// it); moderators' edits of other people's messages stay silent.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0, authorId = 0;
let author = "", other = "", admin = "";
const msg = async (sender: number, content: string) =>
  Number((await t.db.execute({ sql: "INSERT INTO messages (team_id, sender_id, content, timestamp) VALUES (?, ?, ?, ?)", args: [team, sender, content, new Date().toISOString()] })).lastInsertRowid);
const row = async (id: number) => (await t.db.execute({ sql: "SELECT content, edited_at FROM messages WHERE id = ?", args: [id] })).rows[0] as any;

beforeAll(async () => {
  t = await startTestServer("cp-msgedit-");
  team = await seedTeam(t.db, "Chat Team");
  authorId = await seedMember(t.db, team, "Author", "author@test.local");
  author = await t.session(authorId);
  other = await t.session(await seedMember(t.db, team, "Other", "other@test.local"));
  admin = await t.session(await seedMember(t.db, team, "Admin", "admin@test.local", "admin"));
  await t.api("/api/auth/me", { session: admin });
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("editing chat messages", () => {
  it("the author edits their own message, marked edited", async () => {
    const id = await msg(authorId, "helo team");
    const r = await t.patch(`/api/messages/${id}`, { content: "  hello team  " }, author);
    expect(r.status).toBe(200);
    expect(r.body.edited_at).toBeTruthy();
    expect(await row(id)).toMatchObject({ content: "hello team" });
    expect((await row(id)).edited_at).toBeTruthy();
  });

  it("another member can't edit it; an empty edit is refused", async () => {
    const id = await msg(authorId, "mine");
    expect((await t.patch(`/api/messages/${id}`, { content: "hijack" }, other)).status).toBe(403);
    expect((await t.patch(`/api/messages/${id}`, { content: "   " }, author)).status).toBe(400);
    expect((await row(id)).content).toBe("mine");
  });

  it("a moderator's edit of someone else's message stays silent (not marked edited)", async () => {
    const id = await msg(authorId, "bad word");
    const r = await t.patch(`/api/messages/${id}`, { content: "[removed]" }, admin);
    expect(r.status).toBe(200);
    expect(await row(id)).toMatchObject({ content: "[removed]", edited_at: null });
  });

  it("teammates get the author's edit live; a moderator's correction is not broadcast", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
    const seen: any[] = [];
    ws.on("message", (d) => { try { seen.push(JSON.parse(String(d))); } catch { /* ignore */ } });
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: other }));
    await new Promise((r) => setTimeout(r, 400));

    const a = await msg(authorId, "draft");
    const r = await t.patch(`/api/messages/${a}`, { content: "final" }, author);
    const b = await msg(authorId, "oops");
    await t.patch(`/api/messages/${b}`, { content: "[removed]" }, admin);
    await new Promise((r2) => setTimeout(r2, 500));
    ws.close();

    const updates = seen.filter((m) => m.type === "message_updated");
    expect(updates).toEqual([expect.objectContaining({ id: a, content: "final", edited_at: r.body.edited_at })]);
    expect(updates.some((m) => m.id === b)).toBe(false);
    expect(r.body.content).toBe("final");
  });
});
