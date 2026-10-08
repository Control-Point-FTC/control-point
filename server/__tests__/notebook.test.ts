/**
 * Personal notebook API: private to one account (across its workspaces),
 * tree + pages, autosave with conflicts and history, moves, search, and
 * password-locked sections.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { plainText, snippet, UnlockGrants, UNLOCK_MS } from "../notebook";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let ana = "";
let anaOtherWorkspace = "";
let admin = "";
beforeAll(async () => {
  t = await startTestServer("cp-notebook-");
  const robo = await seedTeam(t.db, "Robo");
  const gears = await seedTeam(t.db, "Gears");
  ana = await t.session(await seedMember(t.db, robo, "Ana", "Ana@NB.test"));
  anaOtherWorkspace = await t.session(await seedMember(t.db, gears, "Ana", "ana@nb.test"));
  admin = await t.session(await seedMember(t.db, robo, "Boss", "boss@nb.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const put = (path: string, body: any, session: string) => t.api(path, { method: "PUT", body: JSON.stringify(body), session });
const del = (path: string, session: string) => t.api(path, { method: "DELETE", session });
const tree = async (s: string) => (await t.api("/api/notebook/tree", { session: s })).body;
const doc = (text: string) => [{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }], children: [] }];

describe("notebook", () => {
  let sectionId = 0;
  let pageId = 0;

  it("starts with a notebook and a section, and is the same notebook in every workspace", async () => {
    const tr = await tree(ana);
    expect(tr.notebooks).toHaveLength(1);
    expect(tr.sections).toEqual([expect.objectContaining({ title: "Quick notes", locked: false })]);
    sectionId = tr.sections[0].id;
    expect((await tree(anaOtherWorkspace)).notebooks.map((n: any) => n.id)).toEqual(tr.notebooks.map((n: any) => n.id));
    expect((await t.api("/api/notebook/tree")).status).toBe(401);
  });

  it("makes, reads and saves a page; search finds its text", async () => {
    const r = await t.post("/api/notebook/pages", { sectionId, title: "Kickoff ideas", content: doc("Mecanum drive with odometry pods") }, ana);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    pageId = r.body.id;
    expect(r.body).toMatchObject({ title: "Kickoff ideas", sectionId, parentId: null, content: doc("Mecanum drive with odometry pods") });
    const saved = await put(`/api/notebook/pages/${pageId}`, { content: doc("Swerve this year"), canvas: { items: [{ kind: "text", x: 10, y: 20, text: "linear slides" }], strokes: [] }, baseUpdatedAt: r.body.updatedAt }, ana);
    expect(saved.status).toBe(200);
    expect(saved.body.updatedAt > r.body.updatedAt).toBe(true);
    const hits = (await t.api("/api/notebook/search?q=slides", { session: ana })).body;
    expect(hits).toEqual([expect.objectContaining({ id: pageId, title: "Kickoff ideas", snippet: expect.stringContaining("linear slides") })]);
    expect((await t.api("/api/notebook/search?q=mecanum", { session: ana })).body).toEqual([]);
    expect((await t.api("/api/notebook/search?q=100%25", { session: ana })).body).toEqual([]);
  });

  it("refuses a save based on an older copy (another device saved first)", async () => {
    const r = await put(`/api/notebook/pages/${pageId}`, { title: "Stale", baseUpdatedAt: "2000-01-01T00:00:00.000Z" }, ana);
    expect(r.status).toBe(409);
    expect(r.body.page).toMatchObject({ id: pageId, title: "Kickoff ideas" });
  });

  it("is private: nobody else can see, change or find it", async () => {
    expect((await t.api(`/api/notebook/pages/${pageId}`, { session: admin })).status).toBe(404);
    expect((await put(`/api/notebook/pages/${pageId}`, { title: "pwned" }, admin)).status).toBe(404);
    expect((await del(`/api/notebook/pages/${pageId}`, admin)).status).toBe(404);
    expect((await t.post("/api/notebook/pages", { sectionId, title: "x" }, admin)).status).toBe(404);
    expect((await t.post("/api/notebook/move", { kind: "page", id: pageId, to: { sectionId }, index: 0 }, admin)).status).toBe(404);
    expect((await t.api("/api/notebook/search?q=Kickoff", { session: admin })).body).toEqual([]);
    const theirs = await tree(admin);
    expect(theirs.pages).toEqual([]);
    expect(theirs.sections.some((s: any) => s.id === sectionId)).toBe(false);
  });

  it("keeps history: the state before a save, and restoring brings it back", async () => {
    // The first save above snapshotted the original content.
    const list = (await t.api(`/api/notebook/pages/${pageId}/versions`, { session: ana })).body;
    expect(list.length).toBeGreaterThanOrEqual(1);
    const oldest = list[list.length - 1];
    const v = (await t.api(`/api/notebook/pages/${pageId}/versions/${oldest.id}`, { session: ana })).body;
    expect(v.content).toEqual(doc("Mecanum drive with odometry pods"));
    const restored = await t.post(`/api/notebook/pages/${pageId}/versions/${oldest.id}/restore`, {}, ana);
    expect(restored.body.content).toEqual(doc("Mecanum drive with odometry pods"));
    // What was there before the restore is kept too.
    const after = (await t.api(`/api/notebook/pages/${pageId}/versions`, { session: ana })).body;
    const latest = (await t.api(`/api/notebook/pages/${pageId}/versions/${after[0].id}`, { session: ana })).body;
    expect(latest.content).toEqual(doc("Swerve this year"));
  });

  it("subpages, duplicate, and drag to reorder (never inside itself)", async () => {
    const child = (await t.post("/api/notebook/pages", { sectionId, parentId: pageId, title: "Drivetrain" }, ana)).body;
    expect(child.parentId).toBe(pageId);
    const dup = await t.post(`/api/notebook/pages/${pageId}/duplicate`, {}, ana);
    expect(dup.body).toMatchObject({ title: "Kickoff ideas (copy)", parentId: null });
    let tr = await tree(ana);
    const top = () => tr.pages.filter((p: any) => p.sectionId === sectionId && p.parentId === null).sort((a: any, b: any) => a.sort - b.sort).map((p: any) => p.id);
    expect(top()).toEqual([pageId, dup.body.id]);
    tr = (await t.post("/api/notebook/move", { kind: "page", id: dup.body.id, to: { sectionId, parentId: null }, index: 0 }, ana)).body;
    expect(top()).toEqual([dup.body.id, pageId]);
    expect((await t.post("/api/notebook/move", { kind: "page", id: pageId, to: { sectionId, parentId: child.id }, index: 0 }, ana)).status).toBe(400);
    // A page moved to another section carries its subpages.
    const other = (await t.post("/api/notebook/sections", { notebookId: tr.notebooks[0].id, title: "Build season", color: "#F97316" }, ana)).body;
    expect(other.color).toBe("#f97316");
    await t.post("/api/notebook/move", { kind: "page", id: pageId, to: { sectionId: other.id }, index: 0 }, ana);
    tr = await tree(ana);
    expect(tr.pages.find((p: any) => p.id === pageId)).toMatchObject({ sectionId: other.id, parentId: null });
    expect(tr.pages.find((p: any) => p.id === child.id)).toMatchObject({ sectionId: other.id, parentId: pageId });
    // Deleting a page takes its subpages.
    expect((await del(`/api/notebook/pages/${pageId}`, ana)).body.deleted).toBe(2);
    expect((await t.api(`/api/notebook/pages/${child.id}`, { session: ana })).status).toBe(404);
  });

  it("a locked section hides its pages until unlocked on this sign-in", async () => {
    const nb = (await tree(ana)).notebooks[0].id;
    const diary = (await t.post("/api/notebook/sections", { notebookId: nb, title: "Diary" }, ana)).body;
    const page = (await t.post("/api/notebook/pages", { sectionId: diary.id, title: "Secret plans", content: doc("the big reveal") }, ana)).body;
    expect((await put(`/api/notebook/sections/${diary.id}/lock`, { password: "abc" }, ana)).status).toBe(400);
    expect((await put(`/api/notebook/sections/${diary.id}/lock`, { password: "hunter22" }, ana)).status).toBe(200);
    // Whoever locked it keeps it open; relock to close it here.
    expect((await t.api(`/api/notebook/pages/${page.id}`, { session: ana })).status).toBe(200);
    await t.post(`/api/notebook/sections/${diary.id}/relock`, {}, ana);
    const shut = await t.api(`/api/notebook/pages/${page.id}`, { session: ana });
    expect(shut.status).toBe(423);
    expect(shut.body).toMatchObject({ locked: true, sectionId: diary.id });
    let tr = await tree(ana);
    expect(tr.sections.find((s: any) => s.id === diary.id)).toMatchObject({ locked: true, unlocked: false });
    expect(tr.pages.some((p: any) => p.id === page.id)).toBe(false);
    expect((await t.api("/api/notebook/search?q=reveal", { session: ana })).body).toEqual([]);
    expect((await put(`/api/notebook/pages/${page.id}`, { title: "x" }, ana)).status).toBe(423);
    expect((await del(`/api/notebook/sections/${diary.id}`, ana)).status).toBe(423);
    expect((await t.post(`/api/notebook/sections/${diary.id}/unlock`, { password: "nope" }, ana)).status).toBe(403);
    expect((await t.post(`/api/notebook/sections/${diary.id}/unlock`, { password: "hunter22" }, ana)).status).toBe(200);
    tr = await tree(ana);
    expect(tr.pages.some((p: any) => p.id === page.id)).toBe(true);
    expect((await t.api("/api/notebook/search?q=reveal", { session: ana })).body).toHaveLength(1);
    // The unlock belongs to that sign-in only.
    expect((await t.api(`/api/notebook/pages/${page.id}`, { session: anaOtherWorkspace })).status).toBe(423);
    // Changing the password needs the current one, and ends every unlock.
    expect((await put(`/api/notebook/sections/${diary.id}/lock`, { password: "newpass1" }, ana)).status).toBe(403);
    expect((await put(`/api/notebook/sections/${diary.id}/lock`, { password: null, current: "hunter22" }, ana)).status).toBe(200);
    expect((await t.api(`/api/notebook/pages/${page.id}`, { session: anaOtherWorkspace })).status).toBe(200);
  });

  it("guesses at a password are limited", async () => {
    const nb = (await tree(ana)).notebooks[0].id;
    const s = (await t.post("/api/notebook/sections", { notebookId: nb, title: "Vault" }, ana)).body;
    await put(`/api/notebook/sections/${s.id}/lock`, { password: "correct-horse" }, ana);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await t.post(`/api/notebook/sections/${s.id}/unlock`, { password: `guess${i}` }, anaOtherWorkspace)).status;
    expect(last).toBe(429);
  });

  it("notebooks: rename, colour, reorder and delete with everything in them", async () => {
    const second = (await t.post("/api/notebook/notebooks", { title: "  Outreach  ", color: "nope" }, ana)).body;
    expect(second).toMatchObject({ title: "Outreach", color: null });
    expect((await t.patch(`/api/notebook/notebooks/${second.id}`, { color: "#38bdf8" }, ana)).body.color).toBe("#38bdf8");
    const tr = (await t.post("/api/notebook/move", { kind: "notebook", id: second.id, index: 0 }, ana)).body;
    expect(tr.notebooks[0].id).toBe(second.id);
    const sec = (await t.post("/api/notebook/sections", { notebookId: second.id }, ana)).body;
    const pg = (await t.post("/api/notebook/pages", { sectionId: sec.id }, ana)).body;
    expect(pg.title).toBe("Untitled page");
    expect((await del(`/api/notebook/notebooks/${second.id}`, admin)).status).toBe(404);
    expect((await del(`/api/notebook/notebooks/${second.id}`, ana)).status).toBe(200);
    expect((await t.api(`/api/notebook/pages/${pg.id}`, { session: ana })).status).toBe(404);
  });

  it("is in the data export, and goes with the account", async () => {
    const exp = (await t.api("/api/auth/export", { session: ana })).body;
    expect(exp.notebook.pages.some((p: any) => p.title === "Kickoff ideas (copy)")).toBe(true);
    const n = async () => Number(((await t.db.execute("SELECT COUNT(*) AS n FROM nb_pages WHERE owner = 'ana@nb.test'")).rows[0] as any).n);
    expect(await n()).toBeGreaterThan(0);
    await t.db.execute("UPDATE members SET is_active = 0 WHERE LOWER(email) = 'ana@nb.test'");
    const gone = await del("/api/auth/account", ana);
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect(await n()).toBe(0);
  });
});

describe("notebook helpers", () => {
  it("plain text takes every text node and nothing else", () => {
    expect(plainText("Title", doc("one"), { strokes: [{ points: [[1, 2]], color: "#fff" }], items: [{ kind: "text", text: "two" }] })).toBe("Title one two");
    expect(plainText([{ type: "table", content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "cell" }]] }] } }])).toBe("cell");
  });

  it("snippets centre on the match", () => {
    const text = `${"a ".repeat(100)}needle ${"b ".repeat(100)}`;
    const s = snippet(text, "NEEDLE");
    expect(s).toContain("needle");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("unlocks expire", () => {
    let now = 0;
    const g = new UnlockGrants(() => now);
    g.grant("s1", 5);
    expect(g.has("s1", 5)).toBe(true);
    expect(g.has("s2", 5)).toBe(false);
    expect(g.has(null, 5)).toBe(false);
    now = UNLOCK_MS + 1;
    expect(g.has("s1", 5)).toBe(false);
  });
});
