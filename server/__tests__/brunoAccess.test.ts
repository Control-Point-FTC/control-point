// Settings → Bruno → Team notebook: when a member turns it off, Bruno's
// notebook endpoints refuse for that member (and only that member).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, admin: number, other: number, adminSession: string, otherSession: string;

beforeAll(async () => {
  t = await startTestServer("cp-bruno-access-");
  const team = await seedTeam(t.db, "Robotics");
  admin = await seedMember(t.db, team, "Admin", "admin@access.test", "admin");
  other = await seedMember(t.db, team, "Ana", "ana@access.test", "admin");
  adminSession = await t.session(admin);
  otherSession = await t.session(other);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const preview = (session: string) => t.post("/api/ai/notebook/preview", { ops: [{ op: "create", title: "Plan" }] }, session);

describe("Bruno notebook access switch", () => {
  it("is on by default, and turning it off stops Bruno's notebook actions for that member only", async () => {
    expect((await preview(adminSession)).status).toBe(200);
    const saved = await t.patch("/api/profile", { name: "Admin", bruno_notebook: false }, adminSession);
    expect(saved.status).toBe(200);
    const row = await t.db.execute({ sql: "SELECT bruno_notebook FROM members WHERE id = ?", args: [admin] });
    expect(Number(row.rows[0].bruno_notebook)).toBe(0);
    const off = await preview(adminSession);
    expect(off.status).toBe(403);
    expect(off.body.error).toMatch(/notebook access is turned off/);
    expect((await t.post("/api/ai/notebook/apply", { ops: [{ op: "create", title: "Plan" }], receipt: "test_receipt_access_000001" }, adminSession)).status).toBe(403);
    expect((await preview(otherSession)).status).toBe(200);
    await t.patch("/api/profile", { name: "Admin", bruno_notebook: true }, adminSession);
    expect((await preview(adminSession)).status).toBe(200);
  });
});

describe("notebook text never reaches Bruno when access is off", () => {
  it("gates both read paths: lookups and the open page's screen brief", async () => {
    const { NotebookStore } = await import("../notebook");
    const { notebookLookup, notebookScreenBrief } = await import("../brunoNotebook");
    const { brunoAccess, gatedNotebookBrief, gatedNotebookLookup, BRUNO_NOTEBOOK_OFF } = await import("../brunoAccess");
    const store = new NotebookStore(t.db);
    const teamRow = await t.db.execute({ sql: "SELECT team_id FROM members WHERE id = ?", args: [admin] });
    const ctx = { memberId: admin, teamId: Number(teamRow.rows[0].team_id) };
    const tree = await store.tree({ ...ctx, source: "human" });
    const page: any = await store.create({ ...ctx, source: "human" }, "page", { sectionId: tree.sections[0].id, title: "Gearbox", content: { type: "doc", content: [{ type: "paragraph", attrs: { id: "g1" }, content: [{ type: "text", text: "Secret ratio 20:1" }] }] } });
    const dbGet = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows[0];
    const lookup = (access: any) => gatedNotebookLookup(access, q => notebookLookup(store, ctx, q as any))({ kind: "notebook_page", page: page.id } as any);
    const brief = (access: any) => gatedNotebookBrief(access, () => notebookScreenBrief(store, ctx, page.id));

    await t.db.execute({ sql: "UPDATE members SET bruno_notebook = 0 WHERE id = ?", args: [admin] });
    const off = await brunoAccess(dbGet, admin);
    expect(off.notebook).toBe(false);
    expect(await lookup(off)).toEqual({ lines: [BRUNO_NOTEBOOK_OFF], more: false });
    expect(await brief(off)).toBeUndefined();

    await t.db.execute({ sql: "UPDATE members SET bruno_notebook = 1 WHERE id = ?", args: [admin] });
    const on = await brunoAccess(dbGet, admin);
    expect(JSON.stringify(await lookup(on))).toContain("Secret ratio 20:1");
    expect(await brief(on)).toContain("Gearbox");
  });
});
