// Home → Find Tags: tagged blocks from visible pages only.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { taggedBlocks } from "../notebookTags";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, admin: number, member: number, section: number;
const ctx = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
const para = (text: string, nbTag: string | null = null, id?: string) => ({ type: "paragraph", attrs: { nbTag, ...(id ? { id } : {}) }, content: [{ type: "text", text }] });

beforeAll(async () => {
  t = await startTestServer("cp-notebook-tags-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  admin = await seedMember(t.db, team, "Admin", "admin@tags.test", "admin");
  member = await seedMember(t.db, team, "Max", "max@tags.test");
  section = (await store.tree(ctx(admin))).sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("tag summary", () => {
  it("lists tagged blocks in tree order, and hides protected pages from non-admins", async () => {
    const open = await store.create(ctx(admin), "page", { sectionId: section, title: "Drive", content: { type: "doc", content: [para("Order bolts", "todo", "b-1"), para("Plain line"), para("Check gear ratio?", "question")] } }) as any;
    const secret = await store.create(ctx(admin), "page", { sectionId: section, title: "Strategy", content: { type: "doc", content: [para("Alliance plan", "important")] } }) as any;
    await store.protect(ctx(admin), "page", secret.id, true);

    const forAdmin = await store.tags(ctx(admin), {});
    expect(forAdmin.blocks.map(b => [b.pageTitle, b.tag, b.text])).toEqual([["Drive", "todo", "Order bolts"], ["Drive", "question", "Check gear ratio?"], ["Strategy", "important", "Alliance plan"]]);
    expect(forAdmin.blocks[0].blockId).toBe("b-1");

    const forMember = await store.tags(ctx(member), {});
    expect(forMember.blocks.map(b => b.pageId)).toEqual([open.id, open.id]);
    // Asking for the protected page directly doesn't reveal it either.
    expect((await store.tags(ctx(member), { page: secret.id })).blocks).toEqual([]);
    expect((await store.tags(ctx(member), { page: open.id })).blocks).toHaveLength(2);
    expect((await store.tags(ctx(member), { section })).blocks).toHaveLength(2);
    await expect(store.tags(ctx(member), { section: "abc" })).rejects.toThrow("valid section");
  });

  it("says it was capped only when something was left out", async () => {
    const many = (n: number) => ({ type: "doc", content: Array.from({ length: n }, (_, i) => para(`Item ${i}`, "todo")) });
    const s1 = await store.create(ctx(admin), "section", { notebookId: (await store.tree(ctx(admin))).notebooks[0].id, title: "Exactly" }) as any;
    await store.create(ctx(admin), "page", { sectionId: s1.id, title: "Five hundred", content: many(500) });
    expect(await store.tags(ctx(admin), { section: s1.id })).toMatchObject({ truncated: false });
    expect((await store.tags(ctx(admin), { section: s1.id })).blocks).toHaveLength(500);
    await store.create(ctx(admin), "page", { sectionId: s1.id, title: "One more", content: many(1) });
    const capped = await store.tags(ctx(admin), { section: s1.id });
    expect(capped.truncated).toBe(true); expect(capped.blocks).toHaveLength(500);
  });

  it("reads nested tags, task state and soft line breaks", () => {
    const content = { type: "doc", content: [
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true, nbTag: "todo", id: "t1" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Wire" }, { type: "hardBreak" }, { type: "text", text: "motors" }] }] }] },
      { type: "blockquote", attrs: { nbTag: "remember" }, content: [para("Inner", "important")] },
      para("Unknown tag", "secret"),
    ] };
    const found = taggedBlocks(JSON.stringify(content), { id: 1, title: "P", sectionId: 2, updatedAt: "" });
    expect(found.map(b => [b.tag, b.text, b.done, b.blockId])).toEqual([["todo", "Wire motors", true, "t1"], ["remember", "Inner", null, null], ["important", "Inner", null, null]]);
    expect(taggedBlocks("not json", { id: 1, title: "P", sectionId: 2, updatedAt: "" })).toEqual([]);
    // The shape Home → Tag saves: the tag is on the task's paragraph.
    const saved = { type: "doc", content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [para("Done thing", "todo")] }, { type: "taskItem", attrs: { checked: false }, content: [para("Open thing", "todo")] }] }] };
    expect(taggedBlocks(saved, { id: 1, title: "P", sectionId: 2, updatedAt: "" }).map(b => b.done)).toEqual([true, false]);
    // Malformed children are skipped, not fatal.
    const odd = { type: "doc", content: [{ type: "paragraph", attrs: { nbTag: "todo" }, content: {} }, null, para("Fine", "important")] };
    expect(taggedBlocks(odd, { id: 1, title: "P", sectionId: 2, updatedAt: "" }).map(b => [b.tag, b.text])).toEqual([["todo", ""], ["important", "Fine"]]);
  });
});
