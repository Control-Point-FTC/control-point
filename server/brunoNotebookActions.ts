// Bruno's notebook writes. Bruno only proposes them (a ```notebook block in
// its reply). The member reviews a card the server describes from its own
// data, and nothing is written until they confirm. A confirmed card then
// runs every operation in one transaction:
// - as that member: their edit/organize/delete rights, their name on the revision;
// - under Bruno's visibility: protected sections and pages are unreachable,
//   even for admins, and protection added after the proposal is honoured;
// - keyed by a receipt, so a retried confirm never writes twice;
// - merged into the live shared document, so collaborators keep their edits.
import type { JSONContent } from "@tiptap/core";
import { NotebookError, type NotebookContext, type NotebookStore } from "./notebook.js";
import { markdownToNotebookBlocks, MarkdownTooLargeError, MARKDOWN_LIMIT } from "../src/notebook/markdownBlocks.js";
import { notebookTemplate, NOTEBOOK_TEMPLATES } from "../src/notebook/templates.js";
import { renderNotebookText } from "./brunoNotebook.js";
import { cleanEntryMetaPatch, entryMetaSummary } from "../src/notebook/entryMeta.js";

export type NotebookOp =
  | { op: "create"; title: string; section?: number; parent?: number; template?: string; markdown?: string }
  | { op: "append"; page: number; markdown: string; after?: string }
  | { op: "replace"; page: number; block: string; blocks?: string[]; markdown: string }
  | { op: "rename"; page: number; title: string }
  | { op: "move"; page: number; section?: number; parent?: number | null }
  | { op: "delete"; page: number }
  /** Rows added to the end of an existing table ("table": its block id; omitted = the page's only table). */
  | { op: "add_rows"; page: number; table?: string; rows: string[][] }
  /** Entry metadata: only the fields given change (null clears one). */
  | { op: "tag"; page: number; meta: Record<string, unknown> }
  /** One table cell rewritten ("row"/"column" count from 1, the header row being row 1). "was" is
   *  the cell's text as Bruno read it, and "revision" the page's revision then: rows sorted or
   *  edited since (any change to the page) and the cell is never written by position. */
  | { op: "cell"; page: number; table?: string; row: number; column: number; was: string; markdown: string; revision: number };

export const MAX_NOTEBOOK_OPS = 10;
/** Most blocks one rewrite may replace. */
export const MAX_RUN = 40;
const OPS = ["create", "append", "replace", "rename", "move", "delete", "tag", "add_rows", "cell"] as const;
/** Most rows, columns and characters per cell one add_rows may write. */
export const MAX_ROWS = 50, MAX_COLUMNS = 20, MAX_CELL = 2000;
const META_KEYS: Record<string, string> = { workDate: "workDate", work_date: "workDate", type: "type", stage: "stage", subsystems: "subsystems", awards: "awards" };
const bad = (msg: string) => new NotebookError(msg, 400);
const posInt = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : undefined; };
const blockId = (v: unknown) => typeof v === "string" && /^[\w-]{1,64}$/.test(v) ? v : undefined;
const titleOf = (v: unknown) => typeof v === "string" && v.trim() && v.trim().length <= 200 ? v.trim() : undefined;
const markdownOf = (v: unknown, required: boolean) => {
  if (v === undefined || v === null) { if (required) throw bad("Notebook text is missing"); return ""; }
  if (typeof v !== "string") throw bad("Notebook text must be text");
  if (v.length > MARKDOWN_LIMIT) throw bad(`Notebook text is limited to ${MARKDOWN_LIMIT.toLocaleString()} characters`);
  // Convert once now: text that can't become blocks whole is refused, never cut short.
  try { markdownToNotebookBlocks(v); } catch (e) { if (e instanceof MarkdownTooLargeError) throw bad(e.message); throw e; }
  return v;
};

/** Markdown that is only table rows ("| a | b |" lines, no header separator): rows meant for an
 *  existing table. Appended as text they'd become a stray "| a | b |" paragraph. */
export function pipeRowsOnly(markdown: string): string[][] | null {
  const lines = markdown.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length || lines.some(l => !/^\|.*\|$/.test(l) || l.length < 3)) return null;
  if (lines.some(l => /^\|(\s*:?-+:?\s*\|)+$/.test(l))) return null; // a whole new table, header and all (any GFM separator)
  return lines.map(l => l.slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|")));
}
/** "| a | b |" rows with no "|---|" header line under the first one are plain text in Markdown,
 *  so a table rewritten that way would become one paragraph of pipes. Give each such run of
 *  rows its header line (outside code blocks), so it stays a table. */
export function withTableHeaderLines(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const isRow = (l?: string) => l !== undefined && l.trim().length >= 3 && /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l?: string) => l !== undefined && /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l);
  const out: string[] = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    out.push(line);
    if (fence || !isRow(line) || isSep(line) || isRow(lines[i - 1]) || !isRow(lines[i + 1]) || isSep(lines[i + 1])) return;
    out.push(`|${" --- |".repeat(line.trim().slice(1, -1).split(/(?<!\\)\|/).length)}`);
  });
  return out.join("\n");
}
function rowsOf(raw: unknown): string[][] {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_ROWS) throw bad(`Add 1–${MAX_ROWS} table rows at a time`);
  return raw.map(row => {
    if (!Array.isArray(row) || !row.length || row.length > MAX_COLUMNS) throw bad(`A table row has 1–${MAX_COLUMNS} cells`);
    return row.map(c => {
      const cell = typeof c === "number" ? String(c) : c;
      if (typeof cell !== "string" || cell.length > MAX_CELL) throw bad(`A table cell is text up to ${MAX_CELL.toLocaleString()} characters`);
      return cell.replace(/\s*\n\s*/g, " ").trim();
    });
  });
}

/** Validate a proposal's operations. Anything malformed rejects the whole card. */
export function parseNotebookOps(items: unknown): NotebookOp[] {
  if (!Array.isArray(items) || !items.length) throw bad("No notebook changes to apply");
  if (items.length > MAX_NOTEBOOK_OPS) throw bad(`At most ${MAX_NOTEBOOK_OPS} notebook changes per confirmation`);
  return items.map((raw: any): NotebookOp => {
    if (!raw || typeof raw !== "object" || !OPS.includes(raw.op)) throw bad("Unknown notebook change");
    const page = posInt(raw.page);
    if (raw.op !== "create" && !page) throw bad("A notebook change needs a page id");
    switch (raw.op as NotebookOp["op"]) {
      case "create": {
        const title = titleOf(raw.title);
        if (!title) throw bad("A new page needs a title (up to 200 characters)");
        if (raw.template !== undefined && !NOTEBOOK_TEMPLATES.some(t => t.id === raw.template)) throw bad("Unknown page template");
        return { op: "create", title, ...(posInt(raw.section) ? { section: posInt(raw.section) } : {}), ...(posInt(raw.parent) ? { parent: posInt(raw.parent) } : {}),
          ...(raw.template ? { template: raw.template } : {}), ...(raw.markdown ? { markdown: withTableHeaderLines(markdownOf(raw.markdown, false)) } : {}) };
      }
      case "add_rows": {
        if (raw.table !== undefined && !blockId(raw.table)) throw bad("Invalid table block id");
        return { op: "add_rows", page: page!, ...(raw.table ? { table: raw.table } : {}), rows: rowsOf(raw.rows) };
      }
      case "append": {
        const markdown = markdownOf(raw.markdown, true);
        if (!markdown.trim()) throw bad("Nothing to add");
        if (raw.after !== undefined && !blockId(raw.after)) throw bad("Invalid block id");
        // "| motor | 2 | $79.98 |" on its own is a row for a table on the page, not a paragraph.
        const rows = pipeRowsOnly(markdown);
        if (rows) return { op: "add_rows", page: page!, ...(raw.after ? { table: raw.after } : {}), rows: rowsOf(rows) };
        return { op: "append", page: page!, markdown: withTableHeaderLines(markdown), ...(raw.after ? { after: raw.after } : {}) };
      }
      case "replace": {
        // "blocks": every id of a run of consecutive blocks, in order. Listing
        // them all ties the write to exactly what the card showed.
        if (raw.blocks !== undefined) {
          const list = Array.isArray(raw.blocks) ? raw.blocks.map(blockId) : [];
          if (list.length < 1 || list.length > MAX_RUN || list.some(b => !b) || new Set(list).size !== list.length) throw bad(`A rewrite lists 1–${MAX_RUN} distinct block ids`);
          if (raw.block !== undefined && raw.block !== list[0]) throw bad("A rewrite's first block must start its block list");
          const ids = list as string[];
          return { op: "replace", page: page!, block: ids[0], ...(ids.length > 1 ? { blocks: ids } : {}), markdown: withTableHeaderLines(markdownOf(raw.markdown, true)) };
        }
        const block = blockId(raw.block);
        if (!block) throw bad("A rewrite needs the block id it replaces");
        return { op: "replace", page: page!, block, markdown: withTableHeaderLines(markdownOf(raw.markdown, true)) };
      }
      case "cell": {
        if (raw.table !== undefined && !blockId(raw.table)) throw bad("Invalid table block id");
        const row = posInt(raw.row), column = posInt(raw.column);
        if (!row || !column) throw bad("A cell change needs its row and column (counting from 1)");
        if (typeof raw.was !== "string" || raw.was.length > MAX_CELL) throw bad("A cell change needs the cell's current text (\"was\")");
        const revision = Number(raw.revision);
        if (!Number.isSafeInteger(revision) || revision < 0) throw bad("A cell change needs the page revision it was read at");
        const markdown = typeof raw.markdown === "number" ? String(raw.markdown) : raw.markdown ?? "";
        if (typeof markdown !== "string" || markdown.length > MAX_CELL) throw bad(`A table cell is text up to ${MAX_CELL.toLocaleString()} characters`);
        return { op: "cell", page: page!, ...(raw.table ? { table: raw.table } : {}), row, column, was: raw.was, markdown: markdown.replace(/\s*\n\s*/g, " ").trim(), revision };
      }
      case "tag": {
        const meta: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) if (META_KEYS[k]) meta[META_KEYS[k]] = v;
        // Shape, dates, types and stages are checked now; subsystems against the team's list when shown and applied.
        const subsystems = Array.isArray(meta.subsystems) ? meta.subsystems.map(String) : [];
        const c = cleanEntryMetaPatch(meta, subsystems);
        if ("error" in c) throw bad(c.error);
        return { op: "tag", page: page!, meta };
      }
      case "rename": {
        const title = titleOf(raw.title);
        if (!title) throw bad("A page title must be 1–200 characters");
        return { op: "rename", page: page!, title };
      }
      case "move": {
        if (raw.parent !== undefined && raw.parent !== null && !posInt(raw.parent)) throw bad("Invalid parent page");
        if (raw.section === undefined && raw.parent === undefined) throw bad("A move needs a section or parent page");
        return { op: "move", page: page!, ...(posInt(raw.section) ? { section: posInt(raw.section) } : {}), ...(raw.parent === null ? { parent: null } : posInt(raw.parent) ? { parent: posInt(raw.parent) } : {}) };
      }
      default: return { op: "delete", page: page! };
    }
  });
}

type PMNode = JSONContent;
/** Locate a block by id anywhere in the document: its parent's content array and index. */
function locate(root: PMNode, id: string): { siblings: PMNode[]; index: number } | null {
  const walk = (node: PMNode): { siblings: PMNode[]; index: number } | null => {
    const kids = node.content ?? [];
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].attrs?.id === id) return { siblings: kids, index: i };
      const found = walk(kids[i]);
      if (found) return found;
    }
    return null;
  };
  return walk(root);
}
const changed = () => new NotebookError("That part of the page changed or was removed since Bruno read it. Ask Bruno to read the page again.", 409);
const isEmptyParagraph = (n?: PMNode) => !!n && n.type === "paragraph" && !(n.content ?? []).length;

export function appendBlocks(doc: PMNode, markdown: string, after?: string): PMNode {
  const blocks = markdownToNotebookBlocks(markdown);
  if (!blocks.length) throw bad("Nothing to add");
  doc.content = doc.content ?? [];
  if (after) {
    // Insert after the top-level block that is (or contains) `after`.
    const top = doc.content.findIndex(n => n.attrs?.id === after || !!locate(n, after));
    if (top < 0) throw changed();
    doc.content.splice(top + 1, 0, ...blocks);
  } else if (isEmptyParagraph(doc.content.at(-1))) doc.content.splice(doc.content.length - 1, 0, ...blocks);
  else doc.content.push(...blocks);
  return doc;
}

/** Where a rewrite's blocks are: `blocks` must still be exactly consecutive
 *  siblings in that order, so a block someone inserted after the card was
 *  shown is never removed unseen. */
export function locateRange(doc: PMNode, block: string, blocks?: string[]) {
  const at = locate(doc, block);
  if (!at) return null;
  const ids = blocks ?? [block];
  if (ids[0] !== block) return null;
  // Blank lines between the listed blocks never appear in what Bruno reads (they have no
  // text, so no [#id]); they belong to the run and go with it. Any other block in between
  // still means the page changed.
  let j = at.index;
  for (let i = 1; i < ids.length; i++) {
    j++;
    while (j < at.siblings.length && at.siblings[j]?.attrs?.id !== ids[i] && isBlankLine(at.siblings[j])) j++;
    if (at.siblings[j]?.attrs?.id !== ids[i]) return null;
  }
  return { siblings: at.siblings, index: at.index, count: j - at.index + 1 };
}
/** A paragraph with no visible text (what an empty line in the editor is). */
function isBlankLine(n?: PMNode): boolean {
  return !!n && n.type === "paragraph" && !(n.content ?? []).some(c => c.type !== "hardBreak" && (c.type !== "text" || !!String(c.text ?? "").trim()));
}

/** Every table on the page, however deep (inside a quote or a list item too). */
function allTables(node: PMNode, out: PMNode[] = []): PMNode[] {
  for (const n of node.content ?? []) { if (n.type === "table") out.push(n); else allTables(n, out); }
  return out;
}
/** The table rows go into: the named table (or the table holding the named block), else the page's only table. */
export function findTable(doc: PMNode, table?: string): PMNode {
  const tables = allTables(doc);
  if (table) {
    const hit = tables.find(t => t.attrs?.id === table || !!locate(t, table));
    if (hit) return hit;
    if (!locate(doc, table)) throw changed();
    throw bad("That block isn't a table. Ask Bruno to read the page again and pick the table.");
  }
  if (tables.length === 1) return tables[0];
  throw bad(tables.length ? `This page has ${tables.length} tables. Ask Bruno which one to add the rows to.` : "This page has no table to add rows to.");
}
const escapeCell = (c: string) => c.replace(/\|/g, "\\|");
/** How many columns a table has: the widest row, counting what merged cells span. */
export function tableWidth(table: PMNode): number {
  return Math.max(1, ...(table.content ?? []).map(r => (r.content ?? []).reduce((n, c) => n + Math.max(1, Number(c.attrs?.colspan) || 1), 0)));
}
/** Notebook table rows (fresh ids) for cells written as Markdown, padded to the table's width. */
export function tableRows(width: number, rows: string[][]): PMNode[] {
  if (rows.some(r => r.length > width)) throw bad(`That table has ${width} column${width === 1 ? "" : "s"}; a row has more cells than that.`);
  const md = [`|${" x |".repeat(width)}`, `|${" --- |".repeat(width)}`, ...rows.map(r => `| ${Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? "")).join(" | ")} |`)].join("\n");
  const [built] = markdownToNotebookBlocks(md);
  return (built?.content ?? []).slice(1);
}
export function addTableRows(doc: PMNode, rows: string[][], table?: string): PMNode {
  const node = findTable(doc, table);
  node.content = node.content ?? [];
  node.content.push(...tableRows(tableWidth(node), rows));
  return doc;
}

export function replaceBlock(doc: PMNode, block: string, markdown: string, run?: string[]): PMNode {
  const at = locateRange(doc, block, run);
  if (!at) throw changed();
  const old = at.siblings[at.index];
  const blocks = markdownToNotebookBlocks(markdown);
  // A same-kind rewrite keeps the block's id, so comments and links to it stay attached.
  if (blocks.length && blocks[0].type === old.type) blocks[0].attrs = { ...blocks[0].attrs, id: old.attrs?.id };
  at.siblings.splice(at.index, at.count, ...blocks);
  if (!doc.content?.length) doc.content = [{ type: "paragraph" }];
  return doc;
}

/** A cell's plain text, for checking it against what Bruno read ("was", Markdown or plain). */
const cellText = (content: PMNode[]) => renderNotebookText({ type: "doc", content }, {}, MAX_CELL + 50, { ids: false }).text.replace(/\\\|/g, "|").replace(/\s+/g, " ").trim();
const plainOf = (markdown: string) => cellText(markdown.trim() ? markdownToNotebookBlocks(markdown) : []);
/** The cell an op names, after checking it still reads what Bruno read. */
export function findCell(doc: PMNode, op: { table?: string; row: number; column: number; was: string }): PMNode {
  const row = findTable(doc, op.table).content?.[op.row - 1];
  const cell = row?.content?.[op.column - 1];
  if (!cell) throw bad(`That table has no row ${op.row}, column ${op.column}. Ask Bruno to read the page again.`);
  const now = cellText(cell.content ?? []);
  const was = op.was.replace(/\s+/g, " ").trim();
  // Compared as plain text: Bruno may quote the cell as it read it (Markdown) or as shown.
  if (now !== was && now !== plainOf(op.was)) throw new NotebookError(`That cell changed or was removed since Bruno read it (it reads "${clip(now, 80)}").`, 409);
  return cell;
}
/** Cell text as notebook blocks: inline Markdown (links, bold) only, one paragraph. */
function cellBlocks(markdown: string): PMNode[] {
  const blocks = markdown.trim() ? markdownToNotebookBlocks(markdown) : [];
  if (blocks.some(b => b.type !== "paragraph") || blocks.length > 1) throw bad("A table cell holds one line of text (links and **bold** are fine)");
  return blocks.length ? blocks : [{ type: "paragraph" }];
}
export function setCell(doc: PMNode, op: { table?: string; row: number; column: number; was: string; markdown: string }): PMNode {
  const cell = findCell(doc, op);
  const blocks = cellBlocks(op.markdown);
  // The paragraph keeps its id, so comments and links to it stay attached.
  const old = cell.content?.[0];
  if (old?.type === "paragraph" && old.attrs?.id) blocks[0].attrs = { ...blocks[0].attrs, id: old.attrs.id };
  cell.content = blocks;
  return doc;
}
/** How many links a rewrite removes: for each URL, how many fewer links point to it afterwards. */
function lostLinks(before: PMNode[], after: PMNode[]): number {
  const left = new Map<string, number>();
  for (const h of linksIn(after)) left.set(h, (left.get(h) ?? 0) + 1);
  let lost = 0;
  for (const h of linksIn(before)) { const n = left.get(h) ?? 0; if (n) left.set(h, n - 1); else lost++; }
  return lost;
}
const linkNote = (n: number) => `removes ${n} link${n === 1 ? "" : "s"}`;
/** The target of every link in some blocks, once per link (a rewrite that drops one is flagged on the card). */
function linksIn(nodes: PMNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    for (const m of (n.marks ?? []) as { type?: string; attrs?: Record<string, any> }[]) if (m.type === "link" && m.attrs?.href) out.push(String(m.attrs.href));
    linksIn(n.content ?? [], out);
  }
  return out;
}
const hasTable = (nodes: PMNode[]): boolean => nodes.some(n => n.type === "table" || hasTable(n.content ?? []));

const bruno = (ctx: NotebookContext): NotebookContext => ({ memberId: ctx.memberId, teamId: ctx.teamId, source: "bruno" });
const confirmed = (ctx: NotebookContext): NotebookContext => ({ memberId: ctx.memberId, teamId: ctx.teamId, source: "bruno_confirmed" });
/** Card text: what members read, without the [#block-id] markers Bruno reads pages with. */
const NO_IDS = { ids: false };
const clip = (s: unknown, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// The card shows everything a change writes (bounded by the input limit).
const PREVIEW_LIMIT = MARKDOWN_LIMIT + 5000;
type Tree = Awaited<ReturnType<NotebookStore["tree"]>>;
/** Where a create/move lands. A parent page decides the section, so a
 *  parent-only destination works across sections, in preview and apply alike. */
function destination(tree: Tree, op: { section?: number; parent?: number | null }): { sectionId?: number; error?: string } {
  if (op.parent) {
    const parent = tree.pages.find(p => p.id === op.parent);
    if (!parent) return { error: "That parent page isn't available." };
    if (op.section && op.section !== parent.sectionId) return { error: "That parent page is in a different section." };
    return { sectionId: parent.sectionId };
  }
  if (op.section && !tree.sections.some(s => s.id === op.section)) return { error: "That section isn't available." };
  return { sectionId: op.section };
}

export type NotebookOpPreview = { op: NotebookOp["op"]; summary: string; before?: string; after?: string; destructive?: boolean; error?: string };

/** What the card shows, resolved from the server's data under Bruno's access.
 *  An op whose page Bruno can't see gets an error and no title. */
export async function previewNotebookOps(store: NotebookStore, ctx: NotebookContext, ops: NotebookOp[]): Promise<NotebookOpPreview[]> {
  const tree = await store.tree(bruno(ctx));
  const section = (id?: number) => tree.sections.find(s => s.id === id);
  const pageTitle = (id?: number | null) => tree.pages.find(p => p.id === id)?.title;
  const unavailable = (op: NotebookOp["op"]): NotebookOpPreview => ({ op, summary: "A page Bruno can't access", error: "This page isn't available to Bruno." });
  const out: NotebookOpPreview[] = [];
  for (const op of ops) {
    if (op.op === "create") {
      const where = destination(tree, op);
      const target = section(where.sectionId) ?? (where.error ? undefined : tree.sections[0]);
      if (!target) { out.push({ op: "create", summary: `New page "${clip(op.title, 80)}"`, error: where.error ?? "There is no notebook section to add a page to." }); continue; }
      const body = op.markdown ? renderNotebookText({ type: "doc", content: markdownToNotebookBlocks(op.markdown) }, {}, PREVIEW_LIMIT, NO_IDS).text : op.template ? `${NOTEBOOK_TEMPLATES.find(t => t.id === op.template)?.label} template` : "";
      out.push({ op: "create", summary: `New page "${clip(op.title, 80)}" in ${clip(target.title, 60)}${op.parent ? ` under "${clip(pageTitle(op.parent), 60)}"` : ""}`, ...(body ? { after: body } : {}) });
      continue;
    }
    const title = pageTitle(op.page);
    if (!title) { out.push(unavailable(op.op)); continue; }
    const name = `"${clip(title, 80)}"`;
    if (op.op === "rename") out.push({ op: "rename", summary: `Rename ${name} to "${clip(op.title, 80)}"` });
    else if (op.op === "tag") {
      let teamSubsystems: string[] = [];
      try { teamSubsystems = (await store.entryMeta(bruno(ctx), op.page)).teamSubsystems; } catch { out.push(unavailable(op.op)); continue; }
      const c = cleanEntryMetaPatch(op.meta, teamSubsystems);
      out.push("error" in c ? { op: "tag", summary: `Tag ${name}`, error: c.error } : { op: "tag", summary: `Tag ${name}: ${entryMetaSummary(c.patch)}` });
    }
    else if (op.op === "delete") out.push({ op: "delete", summary: `Move ${name} and its subpages to the trash (restorable from Trash)`, destructive: true });
    else if (op.op === "add_rows") {
      const summary = `Add ${op.rows.length} row${op.rows.length === 1 ? "" : "s"} to the table in ${name}`;
      try {
        const page = await store.page(bruno(ctx), op.page);
        const node = findTable(page.content as PMNode, op.table);
        const rows = tableRows(tableWidth(node), op.rows).map(r => (r.content ?? []).map(c => renderNotebookText({ type: "doc", content: c.content ?? [] }, {}, MAX_CELL + 50, NO_IDS).text.replace(/\s+/g, " ").trim()).join(" | "));
        out.push({ op: "add_rows", summary, after: rows.join("\n") });
      } catch (e) {
        out.push({ op: "add_rows", summary, error: e instanceof NotebookError && e.status !== 404 && e.status !== 403 ? e.message : "This page isn't available to Bruno." });
      }
    }
    else if (op.op === "move") {
      const where = destination(tree, op);
      const to = op.parent ? pageTitle(op.parent) : where.sectionId ? section(where.sectionId)?.title : undefined;
      if (where.error || (!to && op.parent !== null)) { out.push({ op: "move", summary: `Move ${name}`, error: where.error ?? "That destination isn't available." }); continue; }
      out.push({ op: "move", summary: `Move ${name} ${op.parent ? `under "${clip(to, 60)}"` : `to ${clip(to ?? "the top of its section", 60)}`}` });
    } else if (op.op === "cell") {
      const summary = `Change one cell in the table in ${name} (row ${op.row}, column ${op.column})`;
      try {
        const page = await store.page(bruno(ctx), op.page);
        if (page.revision !== op.revision) throw changed();
        const cell = findCell(page.content as PMNode, op);
        const blocks = cellBlocks(op.markdown), after = cellText(blocks);
        // A cleared cell or a dropped link is never applied unseen (auto-apply skips it).
        const lost = lostLinks(cell.content ?? [], blocks);
        out.push({ op: "cell", summary: lost ? `${summary} (${linkNote(lost)})` : summary, before: cellText(cell.content ?? []) || "(empty)", after: after || "(empty)", ...(!after || lost ? { destructive: true } : {}) });
      } catch (e) {
        out.push({ op: "cell", summary, error: e instanceof NotebookError && e.status !== 404 && e.status !== 403 ? e.message : "This page isn't available to Bruno." });
      }
    } else {
      let page;
      try { page = await store.page(bruno(ctx), op.page); } catch { out.push(unavailable(op.op)); continue; }
      const added = renderNotebookText({ type: "doc", content: markdownToNotebookBlocks(op.markdown) }, {}, PREVIEW_LIMIT, NO_IDS).text;
      if (op.op === "append") out.push({ op: "append", summary: `Add to ${name}`, after: added });
      else {
        const at = locateRange(page.content as PMNode, op.block, op.blocks);
        if (!at) { out.push({ op: "replace", summary: `Rewrite part of ${name}`, error: "That part of the page changed or was removed." }); continue; }
        // Everything removed must be reviewable on the card.
        const before = renderNotebookText({ type: "doc", content: at.siblings.slice(at.index, at.index + at.count) }, {}, PREVIEW_LIMIT, NO_IDS);
        if (before.truncated) { out.push({ op: "replace", summary: `Rewrite part of ${name}`, error: "That part is too long to review in one card. Ask Bruno to rewrite it in smaller parts." }); continue; }
        // A rewrite that loses links or turns a table into text is never applied unseen
        // (auto-apply skips it; the member ticks the box). It's named on the card.
        const oldBlocks = at.siblings.slice(at.index, at.index + at.count), newBlocks = markdownToNotebookBlocks(op.markdown);
        const lost = lostLinks(oldBlocks, newBlocks);
        const unTabled = !!added && hasTable(oldBlocks) && !hasTable(newBlocks);
        const losses = [unTabled ? "turns a table into plain text" : "", lost ? linkNote(lost) : ""].filter(Boolean).join(" and ");
        out.push({ op: "replace", summary: `${added ? `Rewrite part of ${name}` : `Remove part of ${name}`}${added && losses ? ` (${losses})` : ""}`, before: before.text, ...(added ? { after: added } : {}), destructive: !added || !!losses });
      }
    }
  }
  return out;
}

/** `revision`: the page's revision after this op (content changes and new pages), what Undo checks. */
export type NotebookOpResult = { op: NotebookOp["op"]; pageId: number; title: string; revision?: number };

/** Apply a confirmed card: one transaction, one receipt, the member's rights,
 *  Bruno's visibility. Any failing operation rolls the whole card back. */
export async function applyNotebookOps(store: NotebookStore, ctx: NotebookContext, ops: NotebookOp[], receiptKey: string) {
  const as = confirmed(ctx);
  return store.batchOnce(as, receiptKey, async () => {
    // Cells are written by position: only onto the page exactly as Bruno read it (checked
    // before this card's own changes move the revision on).
    for (const op of ops) if (op.op === "cell" && (await store.page(as, op.page)).revision !== op.revision) throw changed();
    const results: NotebookOpResult[] = [];
    for (const op of ops) {
      if (op.op === "create") {
        const tree = await store.tree(as);
        const where = destination(tree, op);
        if (where.error) throw new NotebookError(where.error, 404);
        const sectionId = where.sectionId ?? tree.sections[0]?.id;
        if (!sectionId) throw new NotebookError("There is no notebook section to add a page to", 404);
        const content: PMNode = op.markdown ? { type: "doc", content: markdownToNotebookBlocks(op.markdown) } : notebookTemplate(op.template ?? "blank");
        if (!content.content?.length) content.content = [{ type: "paragraph" }];
        const page = await store.create(as, "page", { sectionId, parentId: op.parent ?? null, title: op.title, content });
        results.push({ op: "create", pageId: (page as any).id, title: (page as any).title, revision: (page as any).revision });
      } else if (op.op === "append" || op.op === "replace") {
        const page = await store.mergeEdit(as, op.page, { transform: doc => op.op === "append" ? appendBlocks(doc, op.markdown, op.after) : replaceBlock(doc, op.block, op.markdown, op.blocks) });
        results.push({ op: op.op, pageId: page.id, title: page.title, revision: page.revision });
      } else if (op.op === "add_rows") {
        const page = await store.mergeEdit(as, op.page, { transform: doc => addTableRows(doc, op.rows, op.table) });
        results.push({ op: "add_rows", pageId: page.id, title: page.title, revision: page.revision });
      } else if (op.op === "cell") {
        const page = await store.mergeEdit(as, op.page, { transform: doc => setCell(doc, op) });
        results.push({ op: "cell", pageId: page.id, title: page.title, revision: page.revision });
      } else if (op.op === "tag") {
        await store.saveEntryMeta(as, op.page, op.meta);
        const page = await store.page(as, op.page);
        results.push({ op: "tag", pageId: page.id, title: page.title });
      } else if (op.op === "rename") {
        const page = await store.mergeEdit(as, op.page, { title: op.title });
        results.push({ op: "rename", pageId: page.id, title: page.title, revision: page.revision });
      } else if (op.op === "move") {
        const where = destination(await store.tree(as), op);
        if (where.error) throw new NotebookError(where.error, 404);
        await store.move(as, "page", op.page, { ...(where.sectionId ? { sectionId: where.sectionId } : {}), ...(op.parent !== undefined ? { parentId: op.parent } : {}) }, Number.MAX_SAFE_INTEGER);
        const page = await store.page(as, op.page);
        results.push({ op: "move", pageId: page.id, title: page.title });
      } else {
        const page = await store.page(as, op.page);
        await store.remove(as, "page", op.page);
        results.push({ op: "delete", pageId: page.id, title: page.title });
      }
    }
    return results;
  });
}

/** Card results Undo can take back: changes to a page's text or title, and new pages. */
const UNDOABLE = new Set<NotebookOp["op"]>(["create", "append", "replace", "add_rows", "cell", "rename"]);
export const canUndo = (results: NotebookOpResult[]) => results.length > 0 && results.every(r => UNDOABLE.has(r.op) && Number.isSafeInteger(r.revision));

/** Undo a confirmed card (this member's own): each page it changed goes back to the version
 *  saved just before, merged into the live document like any Bruno change, and a page it
 *  created goes to the trash. Only while nobody has edited those pages since: otherwise
 *  undoing would also throw away their work, so it is refused and nothing changes. */
export async function undoNotebookOps(store: NotebookStore, ctx: NotebookContext, receiptKey: string) {
  const as = confirmed(ctx);
  if (!/^[A-Za-z0-9_-]{16,72}$/.test(receiptKey)) throw bad("Invalid confirmation key");
  const results = await store.receipt(as, receiptKey) as NotebookOpResult[] | null;
  if (!Array.isArray(results)) throw new NotebookError("That change can't be found anymore (changes can be undone for 7 days).", 404);
  if (!canUndo(results)) throw bad("This change can't be undone here. Open the page's version history to restore an earlier version.");
  return store.batchOnce(as, `undo_${receiptKey}`, async () => {
    const pages = new Map<number, { first: number; last: number; created: boolean }>();
    for (const r of results) {
      const p = pages.get(r.pageId) ?? { first: r.revision!, last: r.revision!, created: false };
      p.first = Math.min(p.first, r.revision!); p.last = Math.max(p.last, r.revision!); p.created ||= r.op === "create";
      pages.set(r.pageId, p);
    }
    const undone: NotebookOpResult[] = [];
    const created = new Set([...pages].filter(([, p]) => p.created).map(([id]) => id));
    for (const [pageId, p] of pages) {
      const now = await store.page(as, pageId);
      if (now.revision !== p.last) throw new NotebookError(`"${clip(now.title, 80)}" was edited after Bruno's change, so undoing it would also undo those edits. Open the page's version history to restore an earlier version.`, 409);
      if (p.created) {
        // Trashing a page trashes its subpages: never one this card didn't make (any member's,
        // protected ones included). A subpage the card made goes with its parent.
        if ((await store.descendantIds(as, pageId)).some(id => !created.has(id))) throw new NotebookError(`"${clip(now.title, 80)}" has subpages that were added after Bruno made it, so it can't be undone here. Move it to the trash yourself if you want it gone.`, 409);
        if (now.parentId && created.has(now.parentId)) { undone.push({ op: "delete", pageId, title: now.title }); continue; }
        await store.remove(as, "page", pageId);
        undone.push({ op: "delete", pageId, title: now.title });
        continue;
      }
      const before = await store.versionAt(as, pageId, p.first - 1);
      if (!before) throw new NotebookError(`The version of "${clip(now.title, 80)}" from before Bruno's change is no longer kept. Open the page's version history to restore an earlier version.`, 409);
      const page = await store.mergeEdit(as, pageId, { title: before.title, transform: () => structuredClone(before.content) });
      undone.push({ op: "replace", pageId, title: page.title, revision: page.revision });
    }
    return undone;
  });
}
