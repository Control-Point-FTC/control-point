// Sticky Notes: personal to their author, bounded, and gone with the member.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StickyNotes, stickyPatch, MAX_STICKY_NOTES } from "../stickyNotes";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, notes: StickyNotes, team: number, other: number, ana: number, lee: number, eve: number;
beforeAll(async () => {
  t = await startTestServer("cp-sticky-");
  notes = new StickyNotes(t.db);
  team = await seedTeam(t.db, "T"); other = await seedTeam(t.db, "Other");
  ana = await seedMember(t.db, team, "Ana", "ana@sticky.test", "admin");
  lee = await seedMember(t.db, team, "Lee", "lee@sticky.test", "admin");
  eve = await seedMember(t.db, other, "Eve", "eve@sticky.test", "admin");
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("sticky notes", () => {
  it("are private to their author, even from team admins", async () => {
    const note = await notes.create(team, ana, { body: "Buy zip ties" });
    expect((await notes.list(team, ana)).map(n => n.body)).toContain("Buy zip ties");
    expect(await notes.list(team, lee)).toEqual([]);
    await expect(notes.update(team, lee, note.id, { body: "mine now" })).rejects.toMatchObject({ status: 404 });
    await expect(notes.remove(team, lee, note.id)).rejects.toMatchObject({ status: 404 });
    await expect(notes.update(other, eve, note.id, { body: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("validate what can change and keep within bounds", async () => {
    const note = await notes.create(team, ana, {});
    expect(await notes.update(team, ana, note.id, { color: "mint", x: 300, y: 200, width: 320, height: 240, open: false })).toMatchObject({ color: "mint", x: 300, open: false });
    for (const bad of [{ color: "purple" }, { x: -1 }, { width: 40 }, { body: "y".repeat(10_001) }, { open: "yes" }, { body: 4 }])
      expect(() => stickyPatch(bad), JSON.stringify(bad).slice(0, 40)).toThrow();
    expect(stickyPatch({ member_id: 5, team_id: 9 })).toEqual({});
  });

  it(`allow at most ${MAX_STICKY_NOTES} notes per member`, async () => {
    const member = await seedMember(t.db, team, "Many", "many@sticky.test");
    for (let i = 0; i < MAX_STICKY_NOTES; i++) await notes.create(team, member, { body: String(i) });
    await expect(notes.create(team, member, {})).rejects.toMatchObject({ status: 409 });
  });

  it("HTTP routes require a signed-in member and act only on their own notes", async () => {
    expect((await t.api("/api/sticky-notes")).status).toBe(401);
    const session = await t.session(lee);
    const created = await t.post("/api/sticky-notes", { body: "Lee's note" }, session);
    expect(created.status).toBe(200);
    expect((await t.api("/api/sticky-notes", { session })).body.map((n: any) => n.body)).toEqual(["Lee's note"]);
    const patched = await t.api(`/api/sticky-notes/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ body: "edited" }), session });
    expect(patched.body.body).toBe("edited");
    expect((await t.api(`/api/sticky-notes/${created.body.id}`, { method: "DELETE", session })).status).toBe(200);
    expect((await t.api(`/api/sticky-notes/abc`, { method: "DELETE", session })).status).toBe(400);
  });

  it("are removed when the member is removed from the workspace", async () => {
    const leaving = await seedMember(t.db, team, "Leaving", "leaving@sticky.test");
    await notes.create(team, leaving, { body: "bye" });
    const r = await t.api(`/api/members/${leaving}`, { method: "DELETE", session: await t.session(ana) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const left = await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM sticky_notes WHERE member_id=?", args: [leaving] });
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
