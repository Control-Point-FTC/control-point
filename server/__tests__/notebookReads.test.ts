// History: personal read state (Mark as Read), Recent Edits and Find by
// Author, all limited to pages the member can see.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, admin: number, ana: number, lee: number, section: number;
const ctx = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const unread = async (memberId: number, pageId: number) => ((await store.tree(ctx(memberId))).pages.find(p => p.id === pageId) as { unread?: boolean } | undefined)?.unread;
const edit = async (memberId: number, pageId: number, text: string) => {
  const page = await store.page(ctx(memberId), pageId);
  return store.save(ctx(memberId), pageId, { baseRevision: page.revision, content: doc(text) });
};

beforeAll(async () => {
  t = await startTestServer("cp-notebook-reads-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  admin = await seedMember(t.db, team, "Admin", "admin@reads.test", "admin");
  ana = await seedMember(t.db, team, "Ana", "ana@reads.test", "admin");
  lee = await seedMember(t.db, team, "Lee", "lee@reads.test", "admin");
  section = (await store.tree(ctx(admin))).sections[0].id;
  // Ana and Lee visit once: their baseline starts here.
  await store.tree(ctx(ana)); await store.tree(ctx(lee));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("read state", () => {
  it("someone else's change makes a page unread until it's opened or marked read", async () => {
    const p = await store.create(ctx(admin), "page", { sectionId: section, title: "Drive notes", content: doc("v1") }) as any;
    expect(await unread(ana, p.id)).toBe(true);
    expect(await unread(admin, p.id)).toBe(false);
    // Opening the page (joining its live document) marks it read.
    await store.sync(ctx(ana), p.id, {});
    expect(await unread(ana, p.id)).toBe(false);
    await edit(lee, p.id, "v2");
    expect(await unread(ana, p.id)).toBe(true);
    await store.markRead(ctx(ana), { pageIds: [p.id], read: true });
    expect(await unread(ana, p.id)).toBe(false);
    // Your own edit never makes a page unread for you.
    await edit(ana, p.id, "v3");
    expect(await unread(ana, p.id)).toBe(false);
  });

  it("marks a page unread on request, and a whole section or notebook read", async () => {
    const a = await store.create(ctx(admin), "page", { sectionId: section, title: "A", content: doc("a") }) as any;
    const b = await store.create(ctx(admin), "page", { sectionId: section, title: "B", content: doc("b") }) as any;
    await store.markRead(ctx(lee), { sectionId: section, read: true });
    expect([await unread(lee, a.id), await unread(lee, b.id)]).toEqual([false, false]);
    await store.markRead(ctx(lee), { pageIds: [a.id], read: false });
    expect(await unread(lee, a.id)).toBe(true);
    const book = (await store.tree(ctx(lee))).notebooks[0].id;
    await store.markRead(ctx(lee), { notebookId: book, read: true });
    expect(await unread(lee, a.id)).toBe(false);
  });

  it("read state is personal and never covers pages the member can't see", async () => {
    const secret = await store.create(ctx(admin), "page", { sectionId: section, title: "Secret", protected: true, content: doc("s") }) as any;
    // A non-admin can't mark (or learn about) a protected page.
    const viewer = await seedMember(t.db, team, "Viewer", "viewer@reads.test");
    const res = await store.markRead(ctx(viewer), { pageIds: [secret.id], read: true });
    expect(res.pages).toBe(0);
    expect((await store.tree(ctx(viewer))).pages.some(p => p.id === secret.id)).toBe(false);
    await expect(store.markRead({ memberId: viewer, teamId: team, source: "bruno" }, { pageIds: [secret.id], read: true })).rejects.toMatchObject({ status: 403 });
  });

  it("a new member's first visit doesn't flood them with old pages", async () => {
    const old = await store.create(ctx(admin), "page", { sectionId: section, title: "Old", content: doc("old") }) as any;
    const newcomer = await seedMember(t.db, team, "New", "new@reads.test", "admin");
    expect(await unread(newcomer, old.id)).toBe(false);
  });
});

describe("recent edits and authors", () => {
  it("lists recently changed visible pages, newest first, with the last editor", async () => {
    const p = await store.create(ctx(admin), "page", { sectionId: section, title: "Recent one", content: doc("r") }) as any;
    await edit(lee, p.id, "by lee");
    const recent = await store.recent(ctx(ana), { since: new Date(Date.now() - 60_000).toISOString() });
    expect(recent[0]).toMatchObject({ id: p.id, title: "Recent one", authorName: "Lee" });
    // A member who isn't an admin never sees the protected page in the list.
    const student = await seedMember(t.db, team, "Student", "student@reads.test");
    expect((await store.recent(ctx(student), { since: new Date(0).toISOString() })).map(r => r.title)).not.toContain("Secret");
    expect((await store.recent(ctx(ana), { since: new Date(0).toISOString() })).map(r => r.title)).toContain("Secret");
  });

  it("finds pages by author, including earlier revisions they wrote", async () => {
    const p = await store.create(ctx(ana), "page", { sectionId: section, title: "Ana started this", content: doc("a1") }) as any;
    await edit(lee, p.id, "lee took over");
    const byAna = await store.recent(ctx(admin), { author: ana, since: new Date(0).toISOString() });
    expect(byAna.map(r => r.id)).toContain(p.id);
    const authors = await store.authors(ctx(admin));
    expect(authors.map(a => a.name)).toEqual(expect.arrayContaining(["Ana", "Lee", "Admin"]));
  });

  it("HTTP routes require a session and team", async () => {
    expect((await t.api("/api/notebook/recent")).status).toBe(401);
    const session = await t.session(ana);
    const r = await t.api("/api/notebook/recent", { session });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect((await t.api("/api/notebook/read", { method: "PUT", body: JSON.stringify({ read: true }), session })).status).toBe(400);
  });
});

describe("History review fixes", () => {
  it("an explicit unread mark survives polls of the open page, and a new visit clears it", async () => {
    const p = await store.create(ctx(admin), "page", { sectionId: section, title: "Keep unread", content: doc("k") }) as any;
    const join: any = await store.sync(ctx(ana), p.id, {});
    await store.markRead(ctx(ana), { pageIds: [p.id], read: false });
    await store.sync(ctx(ana), p.id, { epoch: join.epoch });
    expect(await unread(ana, p.id)).toBe(true);
    await store.sync(ctx(ana), p.id, {});
    expect(await unread(ana, p.id)).toBe(false);
  });

  it("purging a page removes its read and contributor rows", async () => {
    const p = await store.create(ctx(admin), "page", { sectionId: section, title: "Purge me", content: doc("x") }) as any;
    await store.markRead(ctx(ana), { pageIds: [p.id], read: true });
    await store.remove(ctx(admin), "page", p.id);
    await store.purge(ctx(admin), "page", p.id, "Purge me");
    for (const table of ["notebook_reads", "notebook_contributors"]) {
      const left = await t.db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE page_id=?`, args: [p.id] });
      expect(Number(left.rows[0].n), table).toBe(0);
    }
  });

  it("an earlier contributor stays findable after their revisions age out", async () => {
    const p = await store.create(ctx(ana), "page", { sectionId: section, title: "Long history", content: doc("a") }) as any;
    await edit(lee, p.id, "lee");
    await t.db.execute({ sql: "DELETE FROM notebook_versions WHERE page_id=?", args: [p.id] });
    expect((await store.recent(ctx(admin), { author: ana, since: new Date(0).toISOString() })).map(r => r.id)).toContain(p.id);
    expect((await store.authors(ctx(admin))).find(a => a.name === "Ana")).toBeTruthy();
  });

  it("pages a member can't see never crowd out the ones they can", async () => {
    const reader = await seedMember(t.db, team, "Reader", "reader@reads.test");
    const visible = await store.create(ctx(admin), "page", { sectionId: section, title: "Older visible", content: doc("v") }) as any;
    const vault = (await store.create(ctx(admin), "section", { notebookId: (await store.tree(ctx(admin))).notebooks[0].id, title: "Vault", protected: true })).id;
    for (let i = 0; i < 520; i++) await t.db.execute({ sql: "INSERT INTO notebook_pages(team_id,section_id,title,content,canvas,plain,position,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      args: [team, vault, `Hidden ${i}`, "[]", "{}", "", i, admin, admin, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()] });
    const recent = await store.recent(ctx(reader), { since: new Date(0).toISOString() });
    expect(recent.map(r => r.id)).toContain(visible.id);
    expect(recent.some(r => r.title.startsWith("Hidden"))).toBe(false);
  });
});
