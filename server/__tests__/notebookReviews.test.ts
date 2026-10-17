/**
 * Feature parity 3.4: mentor review of notebook entries. A member asks for
 * review; a reviewer approves or asks for changes (with a comment); each side
 * is notified with a link to the page. Protected pages stay protected, and
 * Bruno can read the review queue.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore } from "../notebook";
import { notebookLookup } from "../brunoNotebook";
import { BUILD_HELPER_SYSTEM } from "../../ai";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer, team: number, ana: number, ada: number, bo: number;
let anaSession: string, adaSession: string, boSession: string, section: number;
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const newPage = async (title: string, session = anaSession, extra: any = {}) => (await t.post("/api/notebook/pages", { sectionId: section, title, ...extra }, session)).body;

beforeAll(async () => {
  t = await startTestServer("cp-nb-review-");
  team = await seedTeam(t.db, "Robotics");
  ana = await seedMember(t.db, team, "Ana", "ana@rev.test");
  ada = await seedMember(t.db, team, "Ada", "ada@rev.test", "admin");
  bo = await seedMember(t.db, team, "Bo", "bo@rev.test", "admin");
  anaSession = await t.session(ana); adaSession = await t.session(ada); boSession = await t.session(bo);
  section = (await t.api("/api/notebook/tree", { session: anaSession })).body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("mentor review", () => {
  it("a member asks, reviewers are told, a reviewer decides, and the member is told", async () => {
    const p = await newPage("Intake test log");
    const asked = await t.post(`/api/notebook/pages/${p.id}/review`, { note: "Ready for judges?" }, anaSession);
    expect(asked.status).toBe(200);
    expect(asked.body.review).toMatchObject({ status: "pending", note: "Ready for judges?", requestedByName: "Ana" });
    expect((await t.post(`/api/notebook/pages/${p.id}/review`, {}, anaSession)).status).toBe(409);
    await vi.waitFor(async () => expect(await rows("SELECT content, meta FROM notifications WHERE user_id = ?", ada)).toHaveLength(1));
    const [toReviewer] = await rows("SELECT content, meta FROM notifications WHERE user_id = ?", ada);
    expect(toReviewer.content).toBe('Notebook entry "Intake test log" is waiting for your review');
    expect(JSON.parse(toReviewer.meta)).toEqual({ notebook_page_id: p.id });

    const id = asked.body.id;
    // Only reviewers decide; asking for changes needs a comment.
    expect((await t.api(`/api/notebook/reviews/${id}`, { method: "PUT", body: JSON.stringify({ status: "approved" }), session: anaSession })).status).toBe(403);
    expect((await t.api(`/api/notebook/reviews/${id}`, { method: "PUT", body: JSON.stringify({ status: "changes" }), session: adaSession })).status).toBe(400);
    const done = await t.api(`/api/notebook/reviews/${id}`, { method: "PUT", body: JSON.stringify({ status: "changes", comment: "Add the test data table" }), session: adaSession });
    expect(done.body).toMatchObject({ status: "changes", reviewerName: "Ada", comment: "Add the test data table" });
    // A second reviewer a moment later doesn't overwrite it.
    expect((await t.api(`/api/notebook/reviews/${id}`, { method: "PUT", body: JSON.stringify({ status: "approved" }), session: boSession })).status).toBe(409);
    await vi.waitFor(async () => expect(await rows("SELECT content FROM notifications WHERE user_id = ?", ana)).toHaveLength(1));
    expect((await rows("SELECT content FROM notifications WHERE user_id = ?", ana))[0].content).toBe('Changes requested: notebook entry "Intake test log" — Add the test data table');

    const queue = (await t.api("/api/notebook/reviews", { session: anaSession })).body;
    expect(queue).toMatchObject({ canReview: false, pending: 0 });
    expect(queue.items[0]).toMatchObject({ pageId: p.id, status: "changes" });
  });

  it("the requester (or a reviewer) can withdraw an open request", async () => {
    const p = await newPage("Gear ratio notes");
    await t.post(`/api/notebook/pages/${p.id}/review`, {}, anaSession);
    expect((await t.api(`/api/notebook/pages/${p.id}/review`, { method: "DELETE", session: anaSession })).status).toBe(200);
    expect((await t.api(`/api/notebook/pages/${p.id}/review`, { session: anaSession })).body.review).toBeNull();
  });

  it("a protected page: members who can't open it can't ask, and its title stays out of notifications", async () => {
    const p = await newPage("Secret strategy", adaSession, { protected: true });
    expect((await t.post(`/api/notebook/pages/${p.id}/review`, {}, anaSession)).status).toBe(404);
    const before = (await rows("SELECT id FROM notifications WHERE user_id = ?", bo)).length;
    expect((await t.post(`/api/notebook/pages/${p.id}/review`, {}, adaSession)).status).toBe(200);
    await vi.waitFor(async () => expect((await rows("SELECT id FROM notifications WHERE user_id = ?", bo)).length).toBe(before + 1));
    const latest = (await rows("SELECT content FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1", bo))[0];
    expect(latest.content).toBe("A notebook entry is waiting for your review");
    expect((await t.api("/api/notebook/reviews", { session: anaSession })).body.items.some((i: any) => i.pageId === p.id)).toBe(false);
  });

  it("Bruno reads the review queue (pages it can see only)", async () => {
    const p = await newPage("Wiring log");
    await t.post(`/api/notebook/pages/${p.id}/review`, { note: "check the diagram" }, anaSession);
    const out = await notebookLookup(new NotebookStore(t.db), { memberId: ana, teamId: team } as any, { kind: "notebook_reviews" });
    const text = out.lines.join("\n");
    expect(text).toMatch(new RegExp(`page #${p.id} "Wiring log": waiting for review since \\d{4}-\\d{2}-\\d{2} \\(asked by Ana: "check the diagram"\\)`));
    expect(text).toMatch(/"Intake test log": changes requested by Ada on .*"Add the test data table"/);
    expect(text).not.toContain("Secret strategy");
    expect(BUILD_HELPER_SYSTEM).toMatch(/\{"kind":"notebook_reviews"\} lists entries waiting for mentor review/);
  });
});
