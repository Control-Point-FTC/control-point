// Bruno's notebook reads: lookups and screen context go through Bruno-scoped
// access, so protected sections/pages never reach the model, even when a
// team admin is the one asking.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { notebookLookup, notebookScreenBrief, renderNotebookText } from "../brunoNotebook";
import { extractLookupBlocks, runLookups } from "../brunoLookup";
import { parseScreenRequest, formatScreenContext } from "../screenContext";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
let t: TestServer, store: NotebookStore;
let team: number, otherTeam: number, admin: number, member: number, outsider: number;
let section: number, secretSection: number, book: number;
let open: any, secretPage: any, secretChild: any, inSecretSection: any;
const human = (memberId: number, teamId = team): NotebookContext => ({ memberId, teamId, source: "human" });
const para = (id: string, text: string) => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text }] });

beforeAll(async () => {
  t = await startTestServer("cp-bruno-notebook-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  otherTeam = await seedTeam(t.db, "Rivals");
  admin = await seedMember(t.db, team, "Admin", "admin@bn.test", "admin");
  member = await seedMember(t.db, team, "Ana", "ana@bn.test");
  outsider = await seedMember(t.db, otherTeam, "Eve", "eve@bn.test", "admin");
  const tree = await store.tree(human(admin));
  book = tree.notebooks[0].id;
  section = tree.sections[0].id;
  secretSection = (await store.create(human(admin), "section", { notebookId: book, title: "Strategy vault", protected: true })).id;
  open = await store.create(human(admin), "page", { sectionId: section, title: "Drivetrain log", content: { type: "doc", content: [
    { type: "heading", attrs: { id: "h1", level: 2 }, content: [{ type: "text", text: "Gear ratios" }] },
    para("p1", "We chose 19.2:1 for the intake."),
    { type: "taskList", attrs: { id: "tl" }, content: [{ type: "taskItem", attrs: { id: "ti", checked: true }, content: [para("tp", "Order belts")] }] },
  ] } });
  secretPage = await store.create(human(admin), "page", { sectionId: section, title: "Zebra secret plan", protected: true, content: { type: "doc", content: [para("s1", "zebracode alpha intake")] } });
  secretChild = await store.create(human(admin), "page", { sectionId: section, parentId: secretPage.id, title: "Zebra child", content: { type: "doc", content: [para("s2", "zebracode child")] } });
  inSecretSection = await store.create(human(admin), "page", { sectionId: secretSection, title: "Vault intake notes", content: { type: "doc", content: [para("s3", "zebracode vault intake")] } });
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("Bruno notebook lookups", () => {
  const asAdmin = () => ({ memberId: admin, teamId: team });

  it("the admin (human) can open the protected pages Bruno is denied", async () => {
    for (const p of [secretPage, secretChild, inSecretSection]) expect((await store.page(human(admin), p.id)).id).toBe(p.id);
  });

  it("search never returns protected titles or snippets, even for an admin", async () => {
    const r = await notebookLookup(store, asAdmin(), { kind: "notebook", query: "intake" });
    const text = r.lines.join("\n");
    expect(text).toContain("Drivetrain log");
    expect(text).toContain(`page #${open.id}`);
    expect(text).not.toMatch(/zebra|vault/i);
    expect((await notebookLookup(store, asAdmin(), { kind: "notebook", query: "zebracode" })).lines).toEqual([]);
  });

  it("reading a protected page by id reads the same as a page that doesn't exist", async () => {
    const missing = await notebookLookup(store, asAdmin(), { kind: "notebook_page", page: 999_999 });
    for (const p of [secretPage, secretChild, inSecretSection]) {
      const r = await notebookLookup(store, asAdmin(), { kind: "notebook_page", page: p.id });
      expect(r.lines.join("\n")).not.toMatch(/zebra|vault|strategy/i);
      expect(r.lines[0].replace(String(p.id), "N")).toBe(missing.lines[0].replace("999999", "N"));
    }
  });

  it("a page query with no title match reads the best text match, in one lookup", async () => {
    const r = await notebookLookup(store, asAdmin(), { kind: "notebook_page", query: "19.2:1" });
    expect(r.lines.join("\n")).toContain("[#p1] We chose 19.2:1 for the intake.");
    // ...but never falls back to a protected text match.
    expect((await notebookLookup(store, asAdmin(), { kind: "notebook_page", query: "zebracode" })).lines).toEqual([]);
  });

  it("a title lookup can't find a protected page", async () => {
    expect((await notebookLookup(store, asAdmin(), { kind: "notebook_page", query: "Zebra secret plan" })).lines).toEqual([]);
  });

  it("reads an ordinary page as text with block ids", async () => {
    const r = await notebookLookup(store, asAdmin(), { kind: "notebook_page", page: open.id });
    const text = r.lines.join("\n");
    expect(text).toContain('"Drivetrain log"');
    expect(text).toContain("[#h1] ## Gear ratios");
    expect(text).toContain("[#p1] We chose 19.2:1 for the intake.");
    expect(text).toContain("- [x] Order belts");
  });

  it("the outline lists permitted sections and pages only", async () => {
    const text = (await notebookLookup(store, asAdmin(), { kind: "notebook_outline" })).lines.join("\n");
    expect(text).toContain("Drivetrain log");
    expect(text).not.toMatch(/zebra|vault|strategy/i);
  });

  it("another team's pages are invisible", async () => {
    const r = await notebookLookup(store, { memberId: outsider, teamId: otherTeam }, { kind: "notebook_page", page: open.id });
    expect(r.lines.join("\n")).not.toContain("Drivetrain");
    // A member id from another team can't borrow this team's id either.
    await expect(notebookLookup(store, { memberId: outsider, teamId: team }, { kind: "notebook_outline" })).rejects.toMatchObject({ status: 403 });
  });

  it("protection added after a page was readable takes effect on the next lookup", async () => {
    const p = await store.create(human(admin), "page", { sectionId: section, title: "Later locked", content: { type: "doc", content: [para("l1", "quokka text")] } });
    expect((await notebookLookup(store, asAdmin(), { kind: "notebook", query: "quokka" })).lines).toHaveLength(1);
    await store.protect(human(admin), "page", p.id, true);
    expect((await notebookLookup(store, asAdmin(), { kind: "notebook", query: "quokka" })).lines).toEqual([]);
    expect((await notebookLookup(store, asAdmin(), { kind: "notebook_page", page: p.id })).lines.join("")).not.toContain("quokka");
  });
});

describe("Bruno notebook screen context", () => {
  it("names an open ordinary page and resolves the selected blocks server side", async () => {
    const brief = await notebookScreenBrief(store, { memberId: member, teamId: team }, open.id, ["p1", "tp"]);
    expect(brief).toContain(`#${open.id} "Drivetrain log"`);
    expect(brief).toContain("We chose 19.2:1");
    expect(brief).toContain("Order belts");
  });

  it("says nothing at all about a protected page, even for an admin", async () => {
    for (const p of [secretPage, secretChild, inSecretSection]) expect(await notebookScreenBrief(store, { memberId: admin, teamId: team }, p.id, ["s1", "s2", "s3"])).toBe("");
  });

  it("block ids from another page can't pull its text in", async () => {
    const brief = await notebookScreenBrief(store, { memberId: admin, teamId: team }, open.id, ["s1"]);
    expect(brief).not.toContain("zebracode");
  });

  it("parses only ids from the client and drops malformed block ids", () => {
    const r = parseScreenRequest({ route: "/notebook/p/5?x=1", view: "anything", notebookPageId: "5", notebookBlockIds: ["ok-1", "bad id", 7, "x".repeat(65)], taskId: 3 });
    expect(r).toEqual({ route: "/notebook", view: "Team notebook", notebookPageId: 5, notebookBlockIds: ["ok-1"] });
    expect(parseScreenRequest({ route: "/notebook", notebookPageId: -1 })).toEqual({ route: "/notebook", view: "Team notebook" });
    expect(formatScreenContext({ route: "/notebook", view: "Team notebook" }, { notebook: "- Notebook page open: #5" })).toContain("#5");
  });
});

describe("notebook lookup blocks", () => {
  it("parses notebook kinds and drops ones with nothing to look up", () => {
    const { queries } = extractLookupBlocks('Checking…\n```lookup\n[{"kind":"notebook","query":"gear"},{"kind":"notebook_page","page":"12"},{"kind":"notebook"}]\n```');
    expect(queries).toEqual([{ kind: "notebook", query: "gear" }, { kind: "notebook_page", page: 12 }]);
    expect(extractLookupBlocks('```lookup\n{"kind":"notebook_outline"}\n```').queries).toEqual([{ kind: "notebook_outline" }]);
    expect(extractLookupBlocks('```lookup\n{"kind":"notebook_page","page":0}\n```').queries).toEqual([]);
  });

  it("runs notebook lookups through the member-bound runner, and reports a failure instead of 'nothing found'", async () => {
    const db = async () => [];
    const ok = await runLookups(db, team, "UTC", [{ kind: "notebook", query: "gear" }], async () => ({ lines: ["page #1 \"Gear\""], more: false }));
    expect(ok).toContain('page #1 "Gear"');
    const failed = await runLookups(db, team, "UTC", [{ kind: "notebook", query: "gear" }]);
    expect(failed).toContain("SEARCH FAILED");
  });
});

describe("renderNotebookText", () => {
  it("renders tables, code, quotes, files and canvas text boxes; never file contents", () => {
    const { text } = renderNotebookText({ type: "doc", content: [
      { type: "table", attrs: { id: "t" }, content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [para("a", "Part")] }, { type: "tableCell", content: [para("b", "Qty|2")] }] }] },
      { type: "codeBlock", attrs: { id: "c", language: "java" }, content: [{ type: "text", text: "int x = 1;" }] },
      { type: "blockquote", attrs: { id: "q" }, content: [para("q1", "Quoted")] },
      { type: "notebookFile", attrs: { id: "f", name: "datasheet.pdf", fileId: 3 } },
    ] }, { version: 1, objects: [{ id: "x", type: "text", content: { type: "doc", content: [para("cx", "Canvas note")] } }] });
    expect(text).toContain("| Part | Qty\\|2 |");
    expect(text).toContain("```java\nint x = 1;\n```");
    expect(text).toContain("> Quoted");
    expect(text).toContain("[file: datasheet.pdf]");
    expect(text).toContain("- Canvas note");
  });

  it("keeps separate paragraphs apart inside cells, list items and canvas boxes", () => {
    const two = [para("a", "Use 19"), para("b", "2 gears")];
    const { text } = renderNotebookText({ type: "doc", content: [
      { type: "table", attrs: { id: "t" }, content: [{ type: "tableRow", content: [{ type: "tableCell", content: two }] }] },
      { type: "bulletList", attrs: { id: "l" }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }, { type: "hardBreak" }, { type: "text", text: "B" }] }] }] },
    ] }, { version: 1, objects: [{ id: "x", type: "text", content: { type: "doc", content: two } }] });
    expect(text).not.toContain("192");
    expect(text).toContain("| Use 19 2 gears |");
    expect(text).toContain("- A B");
    expect(text).toContain("- Use 19\n  2 gears");
  });

  it("caps long pages and says so", () => {
    const r = renderNotebookText({ type: "doc", content: [para("long", "y".repeat(20_000))] }, {}, 1000);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(1100);
    expect(r.text).toContain("page continues");
  });
});
