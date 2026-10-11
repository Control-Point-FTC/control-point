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

export type NotebookOp =
  | { op: "create"; title: string; section?: number; parent?: number; template?: string; markdown?: string }
  | { op: "append"; page: number; markdown: string; after?: string }
  | { op: "replace"; page: number; block: string; through?: string; markdown: string }
  | { op: "rename"; page: number; title: string }
  | { op: "move"; page: number; section?: number; parent?: number | null }
  | { op: "delete"; page: number };

export const MAX_NOTEBOOK_OPS = 10;
const OPS = ["create", "append", "replace", "rename", "move", "delete"] as const;
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
          ...(raw.template ? { template: raw.template } : {}), ...(raw.markdown ? { markdown: markdownOf(raw.markdown, false) } : {}) };
      }
      case "append": {
        const markdown = markdownOf(raw.markdown, true);
        if (!markdown.trim()) throw bad("Nothing to add");
        if (raw.after !== undefined && !blockId(raw.after)) throw bad("Invalid block id");
        return { op: "append", page: page!, markdown, ...(raw.after ? { after: raw.after } : {}) };
      }
      case "replace": {
        const block = blockId(raw.block);
        if (!block) throw bad("A rewrite needs the block id it replaces");
        // "through": the last block of a run (a heading and everything under it).
        const through = raw.through === undefined || raw.through === null || raw.through === block ? undefined : blockId(raw.through);
        if (raw.through !== undefined && raw.through !== null && raw.through !== block && !through) throw bad("A rewrite's last block id isn't valid");
        return { op: "replace", page: page!, block, ...(through ? { through } : {}), markdown: markdownOf(raw.markdown, true) };
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

/** The run of sibling blocks from `block` through `through` (or just `block`). */
export function locateRange(doc: PMNode, block: string, through?: string) {
  const at = locate(doc, block);
  if (!at) return null;
  if (!through) return { siblings: at.siblings, index: at.index, count: 1 };
  const end = at.siblings.findIndex((n, i) => i >= at.index && n.attrs?.id === through);
  return end < 0 ? null : { siblings: at.siblings, index: at.index, count: end - at.index + 1 };
}

export function replaceBlock(doc: PMNode, block: string, markdown: string, through?: string): PMNode {
  const at = locateRange(doc, block, through);
  if (!at) throw changed();
  const old = at.siblings[at.index];
  const blocks = markdownToNotebookBlocks(markdown);
  // A same-kind rewrite keeps the block's id, so comments and links to it stay attached.
  if (blocks.length && blocks[0].type === old.type) blocks[0].attrs = { ...blocks[0].attrs, id: old.attrs?.id };
  at.siblings.splice(at.index, at.count, ...blocks);
  if (!doc.content?.length) doc.content = [{ type: "paragraph" }];
  return doc;
}

const bruno = (ctx: NotebookContext): NotebookContext => ({ memberId: ctx.memberId, teamId: ctx.teamId, source: "bruno" });
const confirmed = (ctx: NotebookContext): NotebookContext => ({ memberId: ctx.memberId, teamId: ctx.teamId, source: "bruno_confirmed" });
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
      const body = op.markdown ? renderNotebookText({ type: "doc", content: markdownToNotebookBlocks(op.markdown) }, {}, PREVIEW_LIMIT).text : op.template ? `${NOTEBOOK_TEMPLATES.find(t => t.id === op.template)?.label} template` : "";
      out.push({ op: "create", summary: `New page "${clip(op.title, 80)}" in ${clip(target.title, 60)}${op.parent ? ` under "${clip(pageTitle(op.parent), 60)}"` : ""}`, ...(body ? { after: body } : {}) });
      continue;
    }
    const title = pageTitle(op.page);
    if (!title) { out.push(unavailable(op.op)); continue; }
    const name = `"${clip(title, 80)}"`;
    if (op.op === "rename") out.push({ op: "rename", summary: `Rename ${name} to "${clip(op.title, 80)}"` });
    else if (op.op === "delete") out.push({ op: "delete", summary: `Move ${name} and its subpages to the trash (restorable from Trash)`, destructive: true });
    else if (op.op === "move") {
      const where = destination(tree, op);
      const to = op.parent ? pageTitle(op.parent) : where.sectionId ? section(where.sectionId)?.title : undefined;
      if (where.error || (!to && op.parent !== null)) { out.push({ op: "move", summary: `Move ${name}`, error: where.error ?? "That destination isn't available." }); continue; }
      out.push({ op: "move", summary: `Move ${name} ${op.parent ? `under "${clip(to, 60)}"` : `to ${clip(to ?? "the top of its section", 60)}`}` });
    } else {
      let page;
      try { page = await store.page(bruno(ctx), op.page); } catch { out.push(unavailable(op.op)); continue; }
      const added = renderNotebookText({ type: "doc", content: markdownToNotebookBlocks(op.markdown) }, {}, PREVIEW_LIMIT).text;
      if (op.op === "append") out.push({ op: "append", summary: `Add to ${name}`, after: added });
      else {
        const at = locateRange(page.content as PMNode, op.block, op.through);
        if (!at) { out.push({ op: "replace", summary: `Rewrite part of ${name}`, error: "That part of the page changed or was removed." }); continue; }
        out.push({ op: "replace", summary: added ? `Rewrite part of ${name}` : `Remove part of ${name}`, before: renderNotebookText({ type: "doc", content: at.siblings.slice(at.index, at.index + at.count) }, {}, PREVIEW_LIMIT).text, ...(added ? { after: added } : {}), destructive: !added });
      }
    }
  }
  return out;
}

export type NotebookOpResult = { op: NotebookOp["op"]; pageId: number; title: string };

/** Apply a confirmed card: one transaction, one receipt, the member's rights,
 *  Bruno's visibility. Any failing operation rolls the whole card back. */
export async function applyNotebookOps(store: NotebookStore, ctx: NotebookContext, ops: NotebookOp[], receiptKey: string) {
  const as = confirmed(ctx);
  return store.batchOnce(as, receiptKey, async () => {
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
        results.push({ op: "create", pageId: (page as any).id, title: (page as any).title });
      } else if (op.op === "append" || op.op === "replace") {
        const page = await store.mergeEdit(as, op.page, { transform: doc => op.op === "append" ? appendBlocks(doc, op.markdown, op.after) : replaceBlock(doc, op.block, op.markdown, op.through) });
        results.push({ op: op.op, pageId: page.id, title: page.title });
      } else if (op.op === "rename") {
        const page = await store.mergeEdit(as, op.page, { title: op.title });
        results.push({ op: "rename", pageId: page.id, title: page.title });
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
