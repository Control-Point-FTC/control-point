// Confirmed Bruno notebook writes: real editable blocks, the confirming
// member's rights and attribution, Bruno's visibility (never protected
// content), one transaction per card, receipts against duplicate retries, and
// a live merge that keeps collaborators' unsynced edits.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { NotebookStore, type NotebookContext } from "../notebook";
import { appendBlocks, applyNotebookOps, parseNotebookOps, previewNotebookOps, replaceBlock } from "../brunoNotebookActions";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, admin: number, editor: number, reader: number;
let adminSession: string, editorSession: string, readerSession: string;
let section: number, secretSection: number, book: number;
let n = 0, viewerRole = 0;
const key = () => `test_receipt_${String(++n).padStart(8, "0")}_${Date.now()}`;
const human = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
const me = (memberId: number) => ({ memberId, teamId: team });
const para = (id: string, text: string) => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text }] });
const doc = (...blocks: any[]) => ({ type: "doc", content: blocks });
const textOf = (page: any) => JSON.stringify(page.content);
const newPage = (title: string, extra: any = {}) => store.create(human(admin), "page", { sectionId: section, title, content: doc(para("p1", "First line"), para("p2", "Second line")), ...extra }) as Promise<any>;

beforeAll(async () => {
  t = await startTestServer("cp-bruno-notebook-write-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  admin = await seedMember(t.db, team, "Admin", "admin@bnw.test", "admin");
  editor = await seedMember(t.db, team, "Ana", "ana@bnw.test");
  reader = await seedMember(t.db, team, "Reed", "reed@bnw.test");
  adminSession = await t.session(admin);
  editorSession = await t.session(editor);
  readerSession = await t.session(reader);
  const tree = await store.tree(human(admin));
  book = tree.notebooks[0].id;
  section = tree.sections[0].id;
  secretSection = (await store.create(human(admin), "section", { notebookId: book, title: "Vault", protected: true })).id;
  const editRole = await t.db.execute({ sql: "INSERT INTO roles(team_id,name,permissions) VALUES(?, 'Writer', ?)", args: [team, JSON.stringify(["edit_notebook", "organize_notebook", "delete_notebook"])] });
  await t.db.execute({ sql: "INSERT INTO member_roles(member_id,role_id) VALUES(?,?)", args: [editor, Number(editRole.lastInsertRowid)] });
  const readRole = await t.db.execute({ sql: "INSERT INTO roles(team_id,name,permissions) VALUES(?, 'Viewer', '[]')", args: [team] });
  viewerRole = Number(readRole.lastInsertRowid);
  await t.db.execute({ sql: "INSERT INTO member_roles(member_id,role_id) VALUES(?,?)", args: [reader, viewerRole] });
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("parseNotebookOps", () => {
  it("accepts each operation and rejects malformed cards whole", () => {
    expect(parseNotebookOps([{ op: "append", page: "4", markdown: "x" }, { op: "move", page: 4, parent: null }, { op: "delete", page: 4 }]))
      .toEqual([{ op: "append", page: 4, markdown: "x" }, { op: "move", page: 4, parent: null }, { op: "delete", page: 4 }]);
    for (const bad of [[], [{ op: "nuke", page: 1 }], [{ op: "append", markdown: "x" }], [{ op: "replace", page: 1, block: "bad id!", markdown: "" }],
      [{ op: "create", title: "" }], [{ op: "create", title: "x", template: "secret" }], [{ op: "move", page: 1 }], [{ op: "append", page: 1, markdown: "y".repeat(20_001) }],
      Array.from({ length: 11 }, () => ({ op: "delete", page: 1 }))]) {
      expect(() => parseNotebookOps(bad), JSON.stringify(bad).slice(0, 60)).toThrow();
    }
  });
});

describe("block edits", () => {
  it("appends before a trailing empty paragraph, or after a given block", () => {
    const d: any = doc(para("a", "A"), { type: "paragraph", attrs: { id: "end" } });
    appendBlocks(d, "B");
    expect(d.content.map((b: any) => b.content?.[0]?.text ?? "")).toEqual(["A", "B", ""]);
    appendBlocks(d, "C", "a");
    expect(d.content.map((b: any) => b.content?.[0]?.text ?? "")).toEqual(["A", "C", "B", ""]);
    expect(() => appendBlocks(d, "D", "gone")).toThrow(/changed or was removed/);
  });
  it("a same-kind rewrite keeps the block id; empty markdown removes the block", () => {
    const d: any = doc(para("a", "A"), para("b", "B"));
    replaceBlock(d, "a", "A2");
    expect(d.content[0]).toMatchObject({ attrs: { id: "a" }, content: [{ text: "A2" }] });
    replaceBlock(d, "b", "");
    expect(d.content).toHaveLength(1);
    replaceBlock(d, "a", "");
    expect(d.content).toEqual([{ type: "paragraph" }]);
  });
  it("rewrites an exact run of blocks, and keeps links as clickable link marks", () => {
    const d: any = doc(para("h", "Motors"), para("m1", "Yellow Jacket"), para("m2", "NeveRest"), para("tail", "Keep me"));
    replaceBlock(d, "h", "Motors\n\n[goBILDA Yellow Jacket](https://www.gobilda.com/yellow-jacket/) and **NeveRest**", ["h", "m1", "m2"]);
    expect(d.content.map((b: any) => b.attrs?.id)).toEqual(["h", expect.any(String), "tail"]);
    expect(JSON.stringify(d.content[1])).toContain('"href":"https://www.gobilda.com/yellow-jacket/"');
    expect(() => replaceBlock(d, "h", "x", ["h", "gone"])).toThrow(/changed or was removed/);
    expect(() => replaceBlock(d, "tail", "x", ["tail", "h"])).toThrow(/changed or was removed/);
  });
  it("refuses a run that gained a block after it was reviewed", () => {
    const d: any = doc(para("a", "A"), para("new", "Added by a teammate"), para("b", "B"));
    expect(() => replaceBlock(d, "a", "x", ["a", "b"])).toThrow(/changed or was removed/);
    expect(JSON.stringify(d)).toContain("Added by a teammate");
  });
});

describe("parseNotebookOps blocks", () => {
  it("accepts an ordered list of distinct ids and rejects bad lists", () => {
    expect(parseNotebookOps([{ op: "replace", page: 1, blocks: ["a", "b"], markdown: "x" }])).toEqual([{ op: "replace", page: 1, block: "a", blocks: ["a", "b"], markdown: "x" }]);
    expect(parseNotebookOps([{ op: "replace", page: 1, blocks: ["a"], markdown: "x" }])).toEqual([{ op: "replace", page: 1, block: "a", markdown: "x" }]);
    for (const blocks of [[], ["a", "a"], ["no good!"], Array.from({ length: 41 }, (_, i) => `b${i}`), "a"])
      expect(() => parseNotebookOps([{ op: "replace", page: 1, blocks, markdown: "x" }]), JSON.stringify(blocks).slice(0, 40)).toThrow();
    expect(() => parseNotebookOps([{ op: "replace", page: 1, block: "z", blocks: ["a", "b"], markdown: "x" }])).toThrow();
  });
});

describe("confirmed Bruno notebook writes", () => {
  it("previews and applies a multi-block rewrite of an existing page", async () => {
    const p = await newPage("Motors reference");
    const ops = parseNotebookOps([{ op: "replace", page: p.id, blocks: ["p1", "p2"], markdown: "[REV UltraPlanetary](https://www.revrobotics.com/rev-41-1600/)" }]);
    const [preview] = await previewNotebookOps(store, me(editor), ops);
    expect(preview.before).toContain("First line"); expect(preview.before).toContain("Second line");
    await applyNotebookOps(store, me(editor), ops, key());
    const after = await store.page(human(editor), p.id);
    expect(textOf(after)).not.toContain("Second line");
    expect(textOf(after)).toContain('"href":"https://www.revrobotics.com/rev-41-1600/"');
  });
  it("won't offer a rewrite whose removed text is too long to show in full", async () => {
    const long = "x".repeat(15_000);
    const p = await store.create(human(admin), "page", { sectionId: section, title: "Huge", content: doc(para("q1", long), para("q2", long)) }) as any;
    const [preview] = await previewNotebookOps(store, me(editor), parseNotebookOps([{ op: "replace", page: p.id, blocks: ["q1", "q2"], markdown: "Short" }]));
    expect(preview.error).toMatch(/too long to review/);
  });
  it("creates a page with Markdown as real blocks, attributed to the confirming member", async () => {
    const { result } = await applyNotebookOps(store, me(editor), parseNotebookOps([{ op: "create", title: "Build log", markdown: "## Plan\n- [ ] Cut plate\n\n| a | b |\n|---|---|\n| 1 | 2 |" }]), key());
    const page = await store.page(human(editor), result[0].pageId);
    expect(page.title).toBe("Build log");
    expect(page.content.content.map((b: any) => b.type)).toEqual(["heading", "taskList", "table"]);
    expect(page.createdBy).toBe(editor);
    expect(page.updatedBy).toBe(editor);
  });

  it("creates from a template when no text is given", async () => {
    const { result } = await applyNotebookOps(store, me(editor), parseNotebookOps([{ op: "create", title: "Monday", template: "meeting" }]), key());
    expect(textOf(await store.page(human(editor), result[0].pageId))).toContain("Action items");
  });

  it("a parent-only destination uses the parent's section, for create and move alike", async () => {
    const other = (await store.create(human(admin), "section", { notebookId: book, title: "Other section" })).id;
    const parent = await store.create(human(admin), "page", { sectionId: other, title: "Elsewhere", content: doc(para("e", "e")) }) as any;
    const mover = await newPage("Mover");
    const ops = parseNotebookOps([{ op: "create", title: "Child", parent: parent.id }, { op: "move", page: mover.id, parent: parent.id }]);
    const previews = await previewNotebookOps(store, me(editor), ops);
    expect(previews.map(p => p.error)).toEqual([undefined, undefined]);
    expect(previews[0].summary).toContain("in Other section");
    const { result } = await applyNotebookOps(store, me(editor), ops, key());
    for (const id of [result[0].pageId, mover.id]) expect(await store.page(human(editor), id)).toMatchObject({ sectionId: other, parentId: parent.id });
    // A section that contradicts the parent is refused, in preview and on apply.
    const wrong = parseNotebookOps([{ op: "create", title: "Bad", section, parent: parent.id }]);
    expect((await previewNotebookOps(store, me(editor), wrong))[0].error).toMatch(/different section/);
    await expect(applyNotebookOps(store, me(editor), wrong, key())).rejects.toMatchObject({ status: 404 });
  });

  it("refuses text too long to convert whole instead of saving part of it", () => {
    expect(() => parseNotebookOps([{ op: "append", page: 1, markdown: "p\n\n".repeat(401) }])).toThrow(/split it into smaller changes/);
  });

  it("appends, rewrites, renames, moves and trashes; each keeps a revision", async () => {
    const p = await newPage("Edit me");
    const parent = await newPage("Parent");
    await applyNotebookOps(store, me(editor), parseNotebookOps([
      { op: "append", page: p.id, markdown: "**Added** line" },
      { op: "replace", page: p.id, block: "p1", markdown: "Rewritten first" },
      { op: "rename", page: p.id, title: "Edited" },
      { op: "move", page: p.id, parent: parent.id },
    ]), key());
    const after = await store.page(human(editor), p.id);
    expect(after.title).toBe("Edited");
    expect(after.parentId).toBe(parent.id);
    expect(textOf(after)).toContain("Rewritten first");
    expect(textOf(after)).toContain('"text":"Added","marks":[{"type":"bold"');
    expect(textOf(after)).toContain("Second line");
    expect(after.updatedBy).toBe(editor);
    expect((await store.versions(human(editor), p.id) as any[]).length).toBeGreaterThanOrEqual(2);
    await applyNotebookOps(store, me(editor), parseNotebookOps([{ op: "delete", page: parent.id }]), key());
    await expect(store.page(human(editor), p.id)).rejects.toMatchObject({ status: 404 });
    expect((await store.trash(human(admin))).items.map((i: any) => i.id)).toContain(parent.id);
  });

  it("never reaches protected content, even when an admin confirms", async () => {
    const secret = await newPage("Secret plan", { protected: true });
    const inVault = await store.create(human(admin), "page", { sectionId: secretSection, title: "Vault page", content: doc(para("v", "vault")) }) as any;
    for (const op of [{ op: "append", page: secret.id, markdown: "x" }, { op: "replace", page: secret.id, block: "p1", markdown: "x" }, { op: "rename", page: secret.id, title: "x" },
      { op: "delete", page: secret.id }, { op: "append", page: inVault.id, markdown: "x" }, { op: "create", title: "x", section: secretSection }, { op: "create", title: "x", parent: secret.id }]) {
      await expect(applyNotebookOps(store, me(admin), parseNotebookOps([op]), key()), JSON.stringify(op)).rejects.toMatchObject({ status: 404 });
    }
    // Moving an ordinary page into protected space, or a section holding a protected page, is refused too.
    const open = await newPage("Open page");
    await expect(applyNotebookOps(store, me(admin), parseNotebookOps([{ op: "move", page: open.id, section: secretSection }]), key())).rejects.toMatchObject({ status: 404 });
    await expect(applyNotebookOps(store, me(admin), parseNotebookOps([{ op: "move", page: open.id, parent: secret.id }]), key())).rejects.toMatchObject({ status: 404 });
    const holder = await newPage("Holds a secret child");
    await store.create(human(admin), "page", { sectionId: section, parentId: holder.id, title: "Hidden child", protected: true, content: doc(para("h", "hidden")) });
    await expect(applyNotebookOps(store, me(admin), parseNotebookOps([{ op: "delete", page: holder.id }]), key())).rejects.toMatchObject({ status: 404 });
    expect((await store.page(human(admin), secret.id)).title).toBe("Secret plan");
    expect(textOf(await store.page(human(admin), secret.id))).not.toContain('"x"');
  });

  it("previews describe protected pages only as unavailable, with no title", async () => {
    const secret = await newPage("Hidden roadmap", { protected: true });
    const open = await newPage("Visible");
    const previews = await previewNotebookOps(store, me(admin), parseNotebookOps([{ op: "rename", page: secret.id, title: "x" }, { op: "replace", page: open.id, block: "p2", markdown: "New second" }]));
    expect(JSON.stringify(previews)).not.toContain("Hidden roadmap");
    expect(previews[0].error).toBeTruthy();
    expect(previews[1]).toMatchObject({ summary: 'Rewrite part of "Visible"', before: "[#p2] Second line", after: expect.stringContaining("New second") });
  });

  it("honours protection added after the preview", async () => {
    const p = await newPage("Locks later");
    const ops = parseNotebookOps([{ op: "append", page: p.id, markdown: "late" }]);
    expect((await previewNotebookOps(store, me(admin), ops))[0].error).toBeUndefined();
    await store.protect(human(admin), "page", p.id, true);
    await expect(applyNotebookOps(store, me(admin), ops, key())).rejects.toMatchObject({ status: 404 });
  });

  it("rolls the whole card back when one operation fails", async () => {
    const a = await newPage("Atomic A");
    const ops = parseNotebookOps([{ op: "append", page: a.id, markdown: "should not stay" }, { op: "rename", page: 99_999_999, title: "nope" }]);
    await expect(applyNotebookOps(store, me(editor), ops, key())).rejects.toBeTruthy();
    expect(textOf(await store.page(human(editor), a.id))).not.toContain("should not stay");
    expect((await store.page(human(editor), a.id)).revision).toBe(a.revision);
  });

  it("a member without edit rights cannot write through Bruno", async () => {
    const p = await newPage("Read only");
    await expect(applyNotebookOps(store, me(reader), parseNotebookOps([{ op: "append", page: p.id, markdown: "x" }]), key())).rejects.toMatchObject({ status: 403 });
    await expect(applyNotebookOps(store, me(reader), parseNotebookOps([{ op: "create", title: "x" }]), key())).rejects.toMatchObject({ status: 403 });
  });

  it("a retried confirmation replays instead of writing twice", async () => {
    const receipt = key();
    const ops = parseNotebookOps([{ op: "create", title: "Once only" }]);
    const first = await applyNotebookOps(store, me(editor), ops, receipt);
    const second = await applyNotebookOps(store, me(editor), ops, receipt);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
    expect((await store.tree(human(editor))).pages.filter(p => p.title === "Once only")).toHaveLength(1);
    await expect(applyNotebookOps(store, me(admin), ops, receipt)).rejects.toMatchObject({ status: 409 });
    await expect(applyNotebookOps(store, me(editor), ops, "short")).rejects.toMatchObject({ status: 400 });
  });

  it("merges into the live document: a collaborator's unsynced edit survives", async () => {
    const p = await newPage("Live page");
    // A collaborator joins and edits locally without syncing yet.
    const join: any = await store.sync(human(admin), p.id, {});
    const client = new Y.Doc();
    Y.applyUpdate(client, Buffer.from(join.update, "base64"));
    const serverVector = Buffer.from(join.vector, "base64");
    const firstText = (client.getXmlFragment("prosemirror").get(0) as Y.XmlElement).get(0) as Y.XmlText;
    firstText.insert(0, "LOCAL ");
    // Bruno's confirmed append lands first.
    await applyNotebookOps(store, me(editor), parseNotebookOps([{ op: "append", page: p.id, markdown: "From Bruno" }]), key());
    // The collaborator's pending update still applies on the same epoch.
    const sent: any = await store.sync(human(admin), p.id, { epoch: join.epoch, update: Buffer.from(Y.encodeStateAsUpdate(client, serverVector)).toString("base64") });
    expect(sent.epoch).toBe(join.epoch);
    const merged = textOf(await store.page(human(admin), p.id));
    expect(merged).toContain("LOCAL First line");
    expect(merged).toContain("From Bruno");
    client.destroy();
  });
});

describe("HTTP endpoints", () => {
  it("previews and applies as the signed-in member", async () => {
    const p = await newPage("Over HTTP");
    const ops = [{ op: "append", page: p.id, markdown: "via http" }];
    const preview = await t.post("/api/ai/notebook/preview", { ops }, editorSession);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.previews[0].summary).toBe('Add to "Over HTTP"');
    const receipt = key();
    const applied = await t.post("/api/ai/notebook/apply", { ops, receipt }, editorSession);
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.results[0]).toMatchObject({ op: "append", pageId: p.id });
    expect((await t.post("/api/ai/notebook/apply", { ops, receipt }, editorSession)).body.replayed).toBe(true);
    // The first HTTP call seeds default roles; keep the reader view-only.
    await t.db.execute({ sql: "DELETE FROM member_roles WHERE member_id=? AND role_id!=?", args: [reader, viewerRole] });
    expect((await t.post("/api/ai/notebook/apply", { ops, receipt: key() }, readerSession)).status).toBe(403);
    expect((await t.post("/api/ai/notebook/apply", { ops: [{ op: "bogus" }], receipt: key() }, adminSession)).status).toBe(400);
    expect((await t.post("/api/ai/notebook/preview", { ops })).status).toBe(401);
  });
});
