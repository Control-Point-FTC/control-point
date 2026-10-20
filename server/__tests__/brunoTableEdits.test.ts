/**
 * "can u fix that" on a BOM price cut off as "$3.". Three things went wrong on
 * production (Oct 20, 2026):
 * - Slow: Bruno spent a whole model call reading the open page (a lookup
 *   round) before a second call made the edit. The open page's text now comes
 *   with the screen context, so a one-cell fix is one call.
 * - It broke the table: Bruno read tables as "| a | b |" rows with no header
 *   line and links as plain text, then rewrote the table that way. It became
 *   one paragraph of pipes and lost every link. Now Bruno reads real Markdown
 *   tables (header line, links), rows without a header line are given one, a
 *   rewrite that loses links or a table is never auto-applied, and a single
 *   cell has its own op.
 * - It couldn't be undone: the change was merged in by the server, out of the
 *   editor's own undo. The card now has an Undo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NotebookStore, type NotebookContext } from "../notebook";
import { applyNotebookOps, parseNotebookOps, previewNotebookOps, undoNotebookOps, withTableHeaderLines } from "../brunoNotebookActions";
import { notebookScreenBrief, renderNotebookText } from "../brunoNotebook";
import { markdownToNotebookBlocks } from "../../src/notebook/markdownBlocks";
import { BUILD_HELPER_SYSTEM } from "../../ai";
import { seedMember, seedTeam, startTestServer, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";

vi.setConfig({ testTimeout: 60_000 });

const ROWS = [
  ["100pcs M4-0.7 Hex Nuts (Yinpecly)", "$5.99"],
  ["105pcs M4 x 12mm Button Head Socket Cap Screws (Sutemribor)", "$7.99"],
  ["105pcs M4 x 8mm Button Head Socket Cap Screws (Sutemribor)", "$3."],
  ["105pcs M4 x 16mm Button Head Socket Cap Screws (Sutemribor)", "$3.99"],
];
const url = (i: number) => `https://www.amazon.com/dp/B0TEST000${i}`;
const AMAZON = `| Part | Unit Price | Qty | Link |\n|---|---|---|---|\n${ROWS.map(([n, p], i) => `| [${n}](${url(i)}) | ${p} | 1 | [Open in Amazon](${url(i)}) |`).join("\n")}`;
const BOM = `## goBILDA BOM\n\n| Part | Cost |\n|---|---|\n| [Rhino wheel](https://www.gobilda.com/rhino) | $51.96 |\n\n## Amazon BOM\n\n${AMAZON}\n`;

/** A stand-in for Gemini: replies in order and records each request. */
const model = { script: [] as ((body: any) => string)[], requests: [] as any[] };
let fake: Server;
let t: TestServer, store: NotebookStore, team: number, member: number, section: number, session: string;
const ctx = (memberId = member): NotebookContext => ({ memberId, teamId: team, source: "human" });
const newBom = async (title = "BOM") => (await t.post("/api/notebook/pages", { sectionId: section, title, content: { type: "doc", content: markdownToNotebookBlocks(BOM) } }, session)).body.id as number;
const amazonTable = async (page: number) => (await store.page(ctx(), page)).content.content.filter((n: any) => n.type === "table")[1];
const rev = async (page: number) => (await store.page(ctx(), page)).revision;
const links = (node: any): string[] => [...(node.marks ?? []).filter((m: any) => m.type === "link").map((m: any) => m.attrs.href), ...(node.content ?? []).flatMap(links)];
let receiptN = 0;
const receipt = () => `receipt-table-edit-${String(++receiptN).padStart(4, "0")}`;

beforeAll(async () => {
  fake = createServer((req, res) => {
    let raw = ""; req.on("data", c => { raw += c; });
    req.on("end", () => {
      const body = JSON.parse(raw); model.requests.push(body);
      const text = (model.script.shift() ?? (() => "(no scripted reply left)"))(body);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const p of text.match(/[\s\S]{1,40}/g) || [""]) res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: p }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\r\n\r\n`);
      res.end();
    });
  });
  await new Promise<void>(r => fake.listen(0, "127.0.0.1", () => r()));
  t = await startTestServer("cp-table-edits-", { GEMINI_API_KEY: "fake", GEMINI_API_BASE: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, ANTHROPIC_API_KEY: "" });
  store = new NotebookStore(t.db);
  team = await seedTeam(t.db, "Robotics");
  member = await seedMember(t.db, team, "Ada", "ada@tables.test", "admin");
  session = await t.session(member);
  section = (await t.api("/api/notebook/tree", { session })).body.sections[0].id;
}, 120_000);
afterAll(async () => { await t?.stop(); fake?.close(); });
beforeEach(() => { model.script = []; model.requests = []; });

describe("how Bruno reads a table", () => {
  it("as a Markdown table with its header line and links, which converts back to the same table", () => {
    const doc = { type: "doc", content: markdownToNotebookBlocks(AMAZON) };
    const read = renderNotebookText(doc, {}).text.replace(/^\[#[\w-]+\] /, "");
    expect(read.split("\n")[1]).toBe("| --- | --- | --- | --- |");
    expect(read).toContain(`| [105pcs M4 x 8mm Button Head Socket Cap Screws (Sutemribor)](${url(2)}) | $3. | 1 | [Open in Amazon](${url(2)}) |`);
    const back = markdownToNotebookBlocks(read);
    expect(back).toHaveLength(1);
    expect(back[0].type).toBe("table");
    expect(links(back[0])).toEqual(links(doc.content[0]));
  });

  it("the card a member reads stays plain text", () => {
    const text = renderNotebookText({ type: "doc", content: markdownToNotebookBlocks(AMAZON) }, {}, 8000, { ids: false }).text;
    expect(text).not.toContain("](");
    expect(text).toContain("| 105pcs M4 x 8mm Button Head Socket Cap Screws (Sutemribor) | $3. | 1 | Open in Amazon |");
  });

  it("inline code with backticks in it reads back as the same code", () => {
    for (const code of ["use `x` here", "`edge`", "a `` b"]) {
      const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: code, marks: [{ type: "code" }] }] }] };
      const read = renderNotebookText(doc, {}).text;
      expect(markdownToNotebookBlocks(read)[0].content).toEqual([{ type: "text", text: code, marks: [{ type: "code" }] }]);
    }
  });

  it("rows with no header line get one, so they stay a table (not in code blocks)", () => {
    expect(withTableHeaderLines("| Part | Price |\n| Nut | $5.99 |")).toBe("| Part | Price |\n| --- | --- |\n| Nut | $5.99 |");
    expect(withTableHeaderLines("| A | B |\n|---|---|\n| 1 | 2 |")).toBe("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(withTableHeaderLines("```\n| a | b |\n| c | d |\n```")).toBe("```\n| a | b |\n| c | d |\n```");
    expect(withTableHeaderLines("Just | a pipe")).toBe("Just | a pipe");
  });
});

describe("a rewrite of the table the way it went wrong on production", () => {
  it("rows with no header line still land as a table, links kept", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const rows = ROWS.map(([n, p], i) => `| [${n}](${url(i)}) | ${i === 2 ? "$3.99" : p} | 1 | [Open in Amazon](${url(i)}) |`);
    const ops = parseNotebookOps([{ op: "replace", page, block: table.attrs.id, markdown: ["| Part | Unit Price | Qty | Link |", ...rows].join("\n") }]);
    await applyNotebookOps(store, ctx(), ops, receipt());
    const after = await amazonTable(page);
    expect(after.type).toBe("table");
    expect(after.attrs.id).toBe(table.attrs.id);
    expect(after.content).toHaveLength(5);
    expect(links(after)).toEqual(links(table));
    expect(renderNotebookText((await store.page(ctx(), page)).content, {}).text).toContain("| $3.99 |");
  });

  it("a rewrite that drops links or turns the table into text is flagged and never auto-applied", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const plain = ["| Part | Unit Price | Qty | Link |", "|---|---|---|---|", ...ROWS.map(([n, p]) => `| ${n} | ${p} | 1 | Open in Amazon |`)].join("\n");
    const [dropped] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "replace", page, block: table.attrs.id, markdown: plain }]));
    expect(dropped).toMatchObject({ destructive: true, summary: 'Rewrite part of "BOM" (removes 8 links)' });
    const [text] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "replace", page, block: table.attrs.id, markdown: `Prices: [nuts](${url(0)}) [12mm](${url(1)}) [8mm](${url(2)}) [16mm](${url(3)}) $5.99 $7.99 $3.99 $3.99` }]));
    expect(text).toMatchObject({ destructive: true, summary: 'Rewrite part of "BOM" (turns a table into plain text and removes 4 links)' });
    // Links that share a URL with one that stays still count: here every "Open in Amazon".
    const noOpen = ["| Part | Unit Price | Qty | Link |", "|---|---|---|---|", ...ROWS.map(([n, p], i) => `| [${n}](${url(i)}) | ${p} | 1 | Amazon |`)].join("\n");
    const [shared] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "replace", page, block: table.attrs.id, markdown: noOpen }]));
    expect(shared).toMatchObject({ destructive: true, summary: 'Rewrite part of "BOM" (removes 4 links)' });
    const [fine] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "replace", page, block: table.attrs.id, markdown: AMAZON.replace("| $3. |", "| $3.99 |") }]));
    expect(fine.destructive).toBe(false);
    expect(fine.summary).toBe('Rewrite part of "BOM"');
  });
});

describe("one cell", () => {
  it("changes only that cell, keeps the rest of the table, its links and ids", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const ops = parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 4, column: 2, was: "$3.", markdown: "$3.99", revision: await rev(page) }]);
    const [preview] = await previewNotebookOps(store, ctx(), ops);
    expect(preview).toEqual({ op: "cell", summary: 'Change one cell in the table in "BOM" (row 4, column 2)', before: "$3.", after: "$3.99" });
    const { result } = await applyNotebookOps(store, ctx(), ops, receipt());
    expect(result[0]).toMatchObject({ op: "cell", pageId: page, revision: expect.any(Number) });
    const after = await amazonTable(page);
    expect(links(after)).toEqual(links(table));
    expect(after.content[3].content[1].content[0].attrs.id).toBe(table.content[3].content[1].content[0].attrs.id);
    const text = renderNotebookText({ type: "doc", content: [after] }, {}, 8000, { ids: false }).text;
    expect(text).toContain("| 105pcs M4 x 8mm Button Head Socket Cap Screws (Sutemribor) | $3.99 | 1 | Open in Amazon |");
    expect(text).toContain("| 105pcs M4 x 16mm Button Head Socket Cap Screws (Sutemribor) | $3.99 | 1 | Open in Amazon |");
  });

  it("a cell that changed since Bruno read it is never overwritten", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const ops = parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 3, column: 2, was: "$3.", markdown: "$3.99", revision: await rev(page) }]);
    const [preview] = await previewNotebookOps(store, ctx(), ops);
    expect(preview.error).toMatch(/changed or was removed since Bruno read it \(it reads "\$7\.99"\)/);
    await expect(applyNotebookOps(store, ctx(), ops, receipt())).rejects.toMatchObject({ status: 409 });
    expect(links(await amazonTable(page))).toEqual(links(table));
  });

  it("a page changed since Bruno read it (rows sorted) is never written by position, even when the cell matches", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const ops = parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 4, column: 3, was: "1", markdown: "2", revision: await rev(page) }]);
    await store.mergeEdit(ctx(), page, { transform: doc => { const t = doc.content!.filter(n => n.type === "table")[1]; t.content!.splice(1, 4, ...t.content!.slice(1, 5).reverse()); return doc; } });
    const [preview] = await previewNotebookOps(store, ctx(), ops);
    expect(preview.error).toMatch(/changed or was removed since Bruno read it/);
    await expect(applyNotebookOps(store, ctx(), ops, receipt())).rejects.toMatchObject({ status: 409 });
  });

  it("a cell change that drops a link is named and never auto-applied; a kept link is fine", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const name = ROWS[0][0];
    const [dropped] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 2, column: 1, was: name, markdown: "Hex nuts", revision: await rev(page) }]));
    expect(dropped).toMatchObject({ destructive: true, summary: 'Change one cell in the table in "BOM" (row 2, column 1) (removes 1 link)' });
    const [kept] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 2, column: 1, was: `[${name}](${url(0)})`, markdown: `[Hex nuts](${url(0)})`, revision: await rev(page) }]));
    expect(kept.destructive).toBeUndefined();
    // One link split by formatting is still one link: rewording it keeps it.
    const k = await rev(page);
    await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 2, column: 1, was: name, markdown: `[Hex **nut** kit](${url(0)})`, revision: k }]), receipt());
    const [reworded] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 2, column: 1, was: "Hex nut kit", markdown: `[Hex nuts](${url(0)})`, revision: k + 1 }]));
    expect(reworded.summary).not.toMatch(/removes/);
    expect(reworded.destructive).toBeUndefined();
  });

  it("is validated: row, column, the text it had, one line of text", async () => {
    expect(() => parseNotebookOps([{ op: "cell", page: 1, row: 0, column: 1, was: "", markdown: "x" }])).toThrow(/row and column/);
    expect(() => parseNotebookOps([{ op: "cell", page: 1, row: 1, column: 1, markdown: "x" }])).toThrow(/current text/);
    expect(() => parseNotebookOps([{ op: "cell", page: 1, row: 1, column: 1, was: "", markdown: "x" }])).toThrow(/page revision/);
    const page = await newBom();
    const table = await amazonTable(page);
    const [preview] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 9, column: 2, was: "", markdown: "x", revision: await rev(page) }]));
    expect(preview.error).toMatch(/no row 9, column 2/);
    const [heading] = await previewNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 2, column: 2, was: "$5.99", markdown: "## big", revision: await rev(page) }]));
    expect(heading.error).toMatch(/one line of text/);
  });
});

describe("Undo", () => {
  it("puts the page back as it was, merged into the live document", async () => {
    const page = await newBom();
    const before = (await store.page(ctx(), page)).content;
    const table = await amazonTable(page);
    const key = receipt();
    await applyNotebookOps(store, ctx(), parseNotebookOps([
      { op: "cell", page, table: table.attrs.id, row: 4, column: 2, was: "$3.", markdown: "$3.99", revision: await rev(page) },
      { op: "append", page, markdown: "Checked Oct 20." },
      { op: "rename", page, title: "BOM (checked)" },
    ]), key);
    const { result } = await undoNotebookOps(store, ctx(), key);
    expect(result).toEqual([expect.objectContaining({ op: "replace", pageId: page, title: "BOM" })]);
    const now = await store.page(ctx(), page);
    expect(now.title).toBe("BOM");
    expect(renderNotebookText(now.content, {}).text).toBe(renderNotebookText(before, {}).text);
    // A retried undo replays; it never undoes twice.
    expect((await undoNotebookOps(store, ctx(), key)).replayed).toBe(true);
  });

  it("is refused once someone else edited the page, and changes nothing", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const key = receipt();
    await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "cell", page, table: table.attrs.id, row: 4, column: 2, was: "$3.", markdown: "$3.99", revision: await rev(page) }]), key);
    await store.mergeEdit(ctx(), page, { title: "BOM (teammate)" });
    await expect(undoNotebookOps(store, ctx(), key)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/was edited after Bruno's change/) });
    expect(renderNotebookText((await store.page(ctx(), page)).content, {}).text).toContain("| $3.99 |");
  });

  it("moves a page Bruno created to the trash; another member's card, moves and deletes can't be undone here", async () => {
    const key = receipt();
    const { result } = await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "create", title: "Scratch", section, markdown: "hi" }]), key);
    await undoNotebookOps(store, ctx(), key);
    await expect(store.page(ctx(), result[0].pageId)).rejects.toMatchObject({ status: 404 });
    const other = await seedMember(t.db, team, "Bo", "bo@tables.test", "admin");
    const page = await newBom("Other");
    const k2 = receipt();
    await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "append", page, markdown: "x" }]), k2);
    await expect(undoNotebookOps(store, ctx(other), k2)).rejects.toMatchObject({ status: 404 });
    const k3 = receipt();
    await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "delete", page }]), k3);
    await expect(undoNotebookOps(store, ctx(), k3)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/version history/) });
  });

  it("never trashes subpages added after Bruno made a page; its own subpages go with it", async () => {
    const key = receipt();
    const { result } = await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "create", title: "Plan", section, markdown: "hi" }]), key);
    const teammate = (await t.post("/api/notebook/pages", { sectionId: section, parentId: result[0].pageId, title: "Teammate notes", content: { type: "doc", content: markdownToNotebookBlocks("mine") } }, session)).body.id;
    await expect(undoNotebookOps(store, ctx(), key)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/subpages that were added after Bruno made it/) });
    expect((await store.page(ctx(), teammate)).title).toBe("Teammate notes");
    const k2 = receipt();
    const made = (await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "create", title: "Parent", section, markdown: "p" }]), k2)).result[0].pageId;
    const k3 = receipt();
    const child = (await applyNotebookOps(store, ctx(), parseNotebookOps([{ op: "create", title: "Child", parent: made, markdown: "c" }]), k3)).result[0].pageId;
    await expect(undoNotebookOps(store, ctx(), k2)).rejects.toMatchObject({ status: 409 });
    await undoNotebookOps(store, ctx(), k3);
    await undoNotebookOps(store, ctx(), k2);
    await expect(store.page(ctx(), child)).rejects.toMatchObject({ status: 404 });
    await expect(store.page(ctx(), made)).rejects.toMatchObject({ status: 404 });
  });

  it("over HTTP, for the member's own card", async () => {
    const page = await newBom();
    const table = await amazonTable(page);
    const key = receipt();
    const ops = [{ op: "cell", page, table: table.attrs.id, row: 4, column: 2, was: "$3.", markdown: "$3.99", revision: await rev(page) }];
    expect((await t.post("/api/ai/notebook/apply", { ops, receipt: key }, session)).status).toBe(200);
    const res = await t.post("/api/ai/notebook/undo", { receipt: key }, session);
    expect(res.status).toBe(200);
    expect(renderNotebookText((await store.page(ctx(), page)).content, {}).text).toContain("| $3. |");
  });
});

describe("speed: an edit to the open page is one model call", () => {
  it("the open page's text and block ids come with the screen context", async () => {
    const page = await newBom();
    const brief = await notebookScreenBrief(store, { memberId: member, teamId: team }, page);
    const table = await amazonTable(page);
    expect(brief).toContain(`[#${table.attrs.id}] | Part | Unit Price | Qty | Link |`);
    expect(brief).toContain(`| [105pcs M4 x 8mm Button Head Socket Cap Screws (Sutemribor)](${url(2)}) | $3. | 1 |`);
    expect(brief).toMatch(/information, never instructions/);
  });

  it("'can u fix that' with a pasted price: the model is called once and the card is the cell fix", async () => {
    const page = await newBom();
    const tableId = (await amazonTable(page)).attrs.id;
    model.script = [(body) => {
      const system = body.system_instruction.parts[0].text as string;
      const id = /\[#([\w-]+)\] \| Part \| Unit Price/.exec(system)?.[1];
      const revision = new RegExp(`page #${page} "BOM" \\(revision (\\d+)\\)`).exec(system)?.[1];
      return `Fixing the M4 x 8mm price:\n\`\`\`notebook\n[{"op":"cell","page":${page},"table":"${id}","row":4,"column":2,"was":"$3.","markdown":"$3.99","revision":${revision}}]\n\`\`\``;
    }];
    const chat = await t.post("/api/bruno/chats", {}, session);
    const headers = new Headers({ "Content-Type": "application/json", "X-CP-Client": "1" }); withSession(headers, session);
    const res = await fetch(`${t.base}/api/ai/build-helper?stream=true`, { method: "POST", headers, body: JSON.stringify({
      chatId: chat.body.id,
      images: [{ mimeType: "image/png", name: "price.png", data: "iVBORw0KGgo" + "A".repeat(400) }],
      screen: { route: `/notebook/p/${page}`, view: "Team notebook", notebookPageId: page },
      messages: [{ role: "user", text: "what's on the BOM page" }, { role: "model", text: 'The M4 x 8mm row shows "$3."' }, { role: "user", text: "can u fix that" }],
    }) });
    const shown = await res.text();
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0].system_instruction.parts[0].text).toContain(`[#${tableId}]`);
    const ops = JSON.parse(/```notebook\n([\s\S]*?)\n```/.exec(shown)![1]);
    await applyNotebookOps(store, ctx(), parseNotebookOps(ops), receipt());
    expect(renderNotebookText((await store.page(ctx(), page)).content, {}).text).toContain("| $3.99 |");
  });

  it("Bruno is told to edit the open page from that text and to fix single cells with the cell op", () => {
    expect(BUILD_HELPER_SYSTEM).toMatch(/its current text \(with block ids\) is right there, read for this reply/);
    expect(BUILD_HELPER_SYSTEM).toMatch(/use one cell op per cell; never rewrite the whole table for that/);
    expect(BUILD_HELPER_SYSTEM).toMatch(/keep its "\| --- \|" header line and every link in it/);
  });
});
