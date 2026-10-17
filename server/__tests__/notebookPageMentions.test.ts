/**
 * "@Jenny" in a notebook page: picking a member from the @ list pings them with
 * a notification that opens the page, and the ping shows in the notebook's
 * Mentions inbox. Repeats within a few minutes count once; only members who can
 * open the page can be pinged; a protected page's title never goes in the notification.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team: number, ana: number, lee: number, ada: number, outsider: number;
let anaSession: string, leeSession: string, adaSession: string;
let section: number;
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const ping = (pageId: number, memberIds: unknown, session = anaSession) => t.post(`/api/notebook/pages/${pageId}/mentions`, { memberIds }, session);

beforeAll(async () => {
  t = await startTestServer("cp-nb-pmention-");
  team = await seedTeam(t.db, "Robotics");
  ana = await seedMember(t.db, team, "Ana", "ana@pm.test");
  lee = await seedMember(t.db, team, "Lee", "lee@pm.test");
  ada = await seedMember(t.db, team, "Ada", "ada@pm.test", "admin");
  outsider = await seedMember(t.db, await seedTeam(t.db, "Other"), "Zed", "zed@pm.test");
  anaSession = await t.session(ana); leeSession = await t.session(lee); adaSession = await t.session(ada);
  section = (await t.api("/api/notebook/tree", { session: anaSession })).body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("@mentions in notebook pages", () => {
  it("pings a teammate once, with a notification that opens the page and an inbox entry", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Intake test" }, anaSession)).body;
    const r = await ping(p.id, [lee]);
    expect(r.status).toBe(200);
    expect(r.body.notified).toEqual([{ id: lee, name: "Lee" }]);
    const notes = await rows("SELECT content, type, meta FROM notifications WHERE user_id = ?", lee);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("mention");
    expect(notes[0].content).toBe('Ana mentioned you in the notebook page "Intake test"');
    expect(JSON.parse(notes[0].meta)).toEqual({ notebook_page_id: p.id });

    // Retyping or undo/redo moments later doesn't ping again.
    expect((await ping(p.id, [lee])).body.notified).toEqual([]);
    expect(await rows("SELECT id FROM notifications WHERE user_id = ?", lee)).toHaveLength(1);

    const inbox = (await t.api("/api/notebook/mentions", { session: leeSession })).body;
    const item = inbox.find((m: any) => m.pageMentionId);
    expect(item).toMatchObject({ pageId: p.id, title: "Intake test", snippet: "Ana mentioned you on this page", read: false });
    expect((await t.api(`/api/notebook/page-mentions/${item.pageMentionId}/read`, { method: "PUT", session: leeSession })).status).toBe(200);
    expect((await t.api("/api/notebook/mentions", { session: leeSession })).body.find((m: any) => m.pageMentionId).read).toBe(true);
    // Someone else's ping can't be marked read by another member.
    expect((await t.api(`/api/notebook/page-mentions/${item.pageMentionId}/read`, { method: "PUT", session: anaSession })).status).toBe(404);
  });

  it("never pings yourself, and refuses members who can't open the page", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Gear ratio" }, anaSession)).body;
    expect((await ping(p.id, [ana])).body.notified).toEqual([]);
    expect((await ping(p.id, [outsider])).status).toBe(400);
    expect((await ping(p.id, [])).status).toBe(400);
    expect((await ping(p.id, "lee")).status).toBe(400);
    expect(await rows("SELECT id FROM notifications WHERE user_id = ?", outsider)).toHaveLength(0);
  });

  it("a protected page's title stays out of the notification, and students can't be pinged there", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Secret strategy", protected: true }, adaSession)).body;
    expect((await ping(p.id, [lee], adaSession)).status).toBe(400);
    const admin2 = await seedMember(t.db, team, "Bo", "bo@pm.test", "admin");
    expect((await ping(p.id, [admin2], adaSession)).body.notified).toEqual([{ id: admin2, name: "Bo" }]);
    const [note] = await rows("SELECT content FROM notifications WHERE user_id = ?", admin2);
    expect(note.content).toBe("Ada mentioned you on a notebook page");
  });

  it("a notification that can't be saved isn't reported as sent, and trying again delivers it", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Retry page" }, anaSession)).body;
    await t.db.execute("ALTER TABLE notifications RENAME TO notifications_off");
    try {
      const r = await ping(p.id, [lee]);
      expect(r.status).toBe(503);
      expect(await rows("SELECT id FROM notebook_page_mentions WHERE page_id = ?", p.id)).toHaveLength(0);
    } finally {
      await t.db.execute("ALTER TABLE notifications_off RENAME TO notifications");
    }
    const again = await ping(p.id, [lee]);
    expect(again.body.notified).toEqual([{ id: lee, name: "Lee" }]);
    expect(await rows("SELECT id FROM notifications WHERE user_id = ? AND content LIKE '%Retry page%'", lee)).toHaveLength(1);
  });
});
