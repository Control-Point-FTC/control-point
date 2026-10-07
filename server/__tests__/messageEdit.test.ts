// Authors can edit their own chat messages (marked "edited", everyone sees
// it); moderators' edits of other people's messages stay silent.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
});
