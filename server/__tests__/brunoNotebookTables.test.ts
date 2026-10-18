/**
 * Bruno adding to a table on a notebook page (the BOM). It used to append
 * "| 5000 Series Motor | 5000-0001-xxxx | 2 | $79.98 |" as a paragraph under
 * the Notes, outside the table, and when told "add it to the table" it added
 * the row but left the stray line behind. Now rows go into the table (add_rows,
 * and a rows-only append becomes add_rows), and the prompt tells Bruno to
 * remove its own stray copy and update the subtotal in the same card.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotebookStore, type NotebookContext } from "../notebook";
import { addTableRows, applyNotebookOps, parseNotebookOps, pipeRowsOnly, previewNotebookOps } from "../brunoNotebookActions";
import { renderNotebookText } from "../brunoNotebook";
import { markdownToNotebookBlocks } from "../../src/notebook/markdownBlocks";
import { BUILD_HELPER_SYSTEM } from "../../ai";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

const BOM = "| Part | SKU | Qty | Cost |\n|---|---|---|---|\n| [Rhino wheel](https://www.gobilda.com/rhino) | 3614-0014-0072 | 4 | $51.96 |\n\nSubtotal of these lines: $51.96\n\n## Notes\n\n- Prices may change.";
const MOTOR = "| [5000 Series 12VDC Motor](https://www.gobilda.com/5000-series-12vdc-motor-with-8mm-rex-pinion-shaft/) | 5000-0001-0001 | 2 | $79.98 |";

describe("table rows", () => {
  it("recognises rows meant for an existing table, but not a whole new table", () => {
    expect(pipeRowsOnly(MOTOR)).toEqual([["[5000 Series 12VDC Motor](https://www.gobilda.com/5000-series-12vdc-motor-with-8mm-rex-pinion-shaft/)", "5000-0001-0001", "2", "$79.98"]]);
    expect(pipeRowsOnly("| a \\| b | c |")).toEqual([["a | b", "c"]]);
    expect(pipeRowsOnly("| A | B |\n|---|---|\n| 1 | 2 |")).toBeNull();
    expect(pipeRowsOnly("Some text\n| a | b |")).toBeNull();
  });

  it("a rows-only append becomes add_rows; add_rows is validated", () => {
    expect(parseNotebookOps([{ op: "append", page: 4, markdown: MOTOR }])).toEqual([{ op: "add_rows", page: 4, rows: pipeRowsOnly(MOTOR) }]);
    expect(parseNotebookOps([{ op: "append", page: 4, markdown: "## Notes" }])[0].op).toBe("append");
    expect(() => parseNotebookOps([{ op: "add_rows", page: 4, rows: [] }])).toThrow(/1–50 table rows/);
    expect(() => parseNotebookOps([{ op: "add_rows", page: 4, table: "bad id!", rows: [["a"]] }])).toThrow(/table block id/);
  });

  it("adds rows inside the table, padded to its width, and refuses rows that are too wide", () => {
    const doc = { type: "doc", content: markdownToNotebookBlocks(BOM) };
    addTableRows(doc, [["[Motor](https://example.com/m)", "5000-0001-0001", "2", "$79.98"], ["Bolt"]]);
    const table = doc.content.find(n => n.type === "table")!;
    expect(table.content).toHaveLength(4);
    const text = renderNotebookText(doc, {}).text;
    expect(text).toContain("Motor");
    expect(text).toMatch(/\| Bolt \|\s*\|\s*\|\s*\|/);
    expect(doc.content.filter(n => n.type === "paragraph").map(p => renderNotebookText({ type: "doc", content: [p] }, {}).text)).not.toContain(expect.stringContaining("5000-0001-0001"));
    expect(() => addTableRows(doc, [["1", "2", "3", "4", "5"]])).toThrow(/4 columns/);
  });
});

let t: TestServer, store: NotebookStore, team: number, member: number, section: number, session: string;
const ctx = (memberId: number): NotebookContext => ({ memberId, teamId: team, source: "human" });
beforeAll(async () => {
  t = await startTestServer("cp-nb-tables-");
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  member = await seedMember(t.db, team, "Sushil", "s@tables.test");
  session = await t.session(member);
  section = (await t.api("/api/notebook/tree", { session })).body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("Bruno's table rows on a real page", () => {
  it("the card shows the row, confirming puts it in the table, and the stray line can be removed in the same card", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "BOM", content: { type: "doc", content: [...markdownToNotebookBlocks(BOM), { type: "paragraph", attrs: { id: "stray1" }, content: [{ type: "text", text: "| 5000 Series 12VDC Motor | 5000-0001-xxxx | 2 | $79.98 |" }] }] } }, session)).body;
    const ops = parseNotebookOps([
      { op: "append", page: p.id, markdown: MOTOR },
      { op: "replace", page: p.id, block: "stray1", markdown: "" },
    ]);
    const preview = await previewNotebookOps(store, ctx(member), ops);
    expect(preview[0]).toMatchObject({ op: "add_rows", summary: 'Add 1 row to the table in "BOM"' });
    expect(preview[0].after).toContain("5000-0001-0001 | 2 | $79.98");
    expect(preview[1]).toMatchObject({ op: "replace", summary: 'Remove part of "BOM"', destructive: true });
    await applyNotebookOps(store, ctx(member), ops, "receipt-table-rows-0001");
    const page = await store.page(ctx(member), p.id);
    const table = (page.content as any).content.find((n: any) => n.type === "table");
    expect(table.content).toHaveLength(3);
    const text = renderNotebookText(page.content, {}).text;
    expect(text).not.toContain("5000-0001-xxxx");
    expect(text.match(/5000-0001-0001/g)).toHaveLength(1);
  });

  it("a page with two tables needs Bruno to say which one", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Two tables", content: { type: "doc", content: markdownToNotebookBlocks(`${BOM}\n\n| A | B |\n|---|---|\n| 1 | 2 |`) } }, session)).body;
    const [preview] = await previewNotebookOps(store, ctx(member), parseNotebookOps([{ op: "add_rows", page: p.id, rows: [["x"]] }]));
    expect(preview.error).toMatch(/2 tables/);
  });
});

describe("Bruno's table rules", () => {
  it("uses add_rows, keeps the list in mind, and cleans up its own stray copy", () => {
    expect(BUILD_HELPER_SYSTEM).toMatch(/To add to a table, ALWAYS use add_rows/);
    expect(BUILD_HELPER_SYSTEM).toMatch(/they mean the list or table you've been working on earlier in this chat/);
    expect(BUILD_HELPER_SYSTEM).toMatch(/both add it correctly AND remove the wrong copy/);
  });
});

describe("tables in every shape", () => {
  it("a whole new table with a one-dash separator is still a new table", () => {
    expect(pipeRowsOnly("| A | B |\n| - | - |\n| 1 | 2 |")).toBeNull();
    expect(pipeRowsOnly("| Bolt | - |")).toEqual([["Bolt", "-"]]);
  });

  it("finds a table inside a quote or list, by id or as the page's only table", () => {
    const doc = { type: "doc", content: markdownToNotebookBlocks(`> | A | B |\n> |---|---|\n> | 1 | 2 |`) };
    addTableRows(doc, [["3", "4"]]);
    const quote = doc.content[0];
    const table = quote.content!.find((n: any) => n.type === "table")!;
    expect(table.content).toHaveLength(3);
    addTableRows(doc, [["5", "6"]], table.attrs!.id);
    expect(table.content).toHaveLength(4);
  });

  it("counts the columns merged cells cover", () => {
    const cell = (text: string, colspan = 1) => ({ type: "tableCell", attrs: { colspan }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const doc: any = { type: "doc", content: [{ type: "table", attrs: { id: "t1" }, content: [{ type: "tableRow", content: [cell("Part", 2), cell("Cost")] }] }] };
    addTableRows(doc, [["Wheel", "4", "$12.99"]]);
    expect(doc.content[0].content[1].content).toHaveLength(3);
    expect(() => addTableRows(doc, [["a", "b", "c", "d"]])).toThrow(/3 columns/);
  });
});

describe("what the card shows", () => {
  it("never shows the [#block-id] markers Bruno reads pages with", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Ids page", content: { type: "doc", content: markdownToNotebookBlocks("Old line") } }, session)).body;
    const page = await store.page(ctx(member), p.id);
    const block = (page.content as any).content[0].attrs.id;
    const preview = await previewNotebookOps(store, ctx(member), parseNotebookOps([
      { op: "append", page: p.id, markdown: "## Amazon\n\n| Item | Price |\n|---|---|\n| Nuts | $5.99 |" },
      { op: "replace", page: p.id, block, markdown: "New line" },
    ]));
    for (const x of preview) for (const text of [x.before, x.after]) if (text) expect(text).not.toMatch(/\[#/);
    expect(preview[0].after).toContain("Amazon");
  });
});

describe("card text keeps real text", () => {
  it("a code line that looks like a block id is shown as written", async () => {
    const p = (await t.post("/api/notebook/pages", { sectionId: section, title: "Code ids", content: { type: "doc", content: markdownToNotebookBlocks("Intro") } }, session)).body;
    const [preview] = await previewNotebookOps(store, ctx(member), parseNotebookOps([{ op: "append", page: p.id, markdown: "```\n[#42] check motor\n```" }]));
    expect(preview.after).toContain("[#42] check motor");
  });
});
