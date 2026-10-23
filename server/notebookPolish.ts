// "Polish with Bruno": rough notes on a notebook page become organised blocks
// (headings, lists, checklists, small tables). Bruno only sees typed text;
// pictures, files, tables, code and drawings stand in as numbered [[keep N]]
// lines that must come back exactly once, in order, so nothing that isn't
// text can be moved, lost or rewritten. The member previews the result and
// applies it in their own editor (one undoable edit), never the server.
import type { JSONContent } from "@tiptap/core";
import { notebookBlockMarkdown } from "../src/notebook/markdownExport.js";
import { markdownToNotebookBlocks } from "../src/notebook/markdownBlocks.js";

/** Most Markdown sent in one polish; longer pages polish a selection at a time. */
export const POLISH_LIMIT = 12_000;
/** Top-level blocks Bruno may rewrite, as long as nothing inside them is a keep-type block. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote"]);
const INNER_TEXT = new Set([...TEXT_BLOCKS, "listItem", "taskItem", "text", "hardBreak"]);
/** A keep-type block (or anything else this file doesn't know) is never rewritten. */
export const KEEP_NODE = "polishKeep";
const KEEP_LINE = /^\s*\[\[keep (\d+)\]\]\s*$/;

type Node = { type?: string; text?: string; attrs?: Record<string, any>; marks?: { type?: string }[]; content?: Node[] };
export class PolishError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

/** Formatting Markdown carries both ways. A block with anything else (superscript, underline, colour,
 *  a highlight, centred or indented text) is kept as it is: Bruno never sees it, so it can't lose it. */
const MARKS = new Set(["bold", "italic", "strike", "code", "link"]);
const plainAttrs = (node: Node) => (!node.attrs?.textAlign || node.attrs.textAlign === "left") && !node.attrs?.indent;
const textOnly = (node: Node): boolean => !!node.type && INNER_TEXT.has(node.type) && plainAttrs(node)
  && (node.marks ?? []).every(m => MARKS.has(m.type ?? "")) && (node.content ?? []).every(textOnly);

/** `texts`: each text block's Markdown, with the ids of the blocks that read exactly that (in page order). */
export type PolishSource = { markdown: string; keep: string[]; blocks: string[]; texts: Map<string, string[]> };

/** The page's top-level blocks (all, or the run `ids` names, which must sit
 *  together) as Markdown for Bruno, with every non-text block as a keep line. */
export function polishSource(content: unknown, ids?: string[]): PolishSource {
  const top: Node[] = Array.isArray((content as Node)?.content) ? (content as Node).content! : [];
  let range = top;
  if (ids?.length) {
    const at = ids.map(id => top.findIndex(n => n.attrs?.id === id));
    if (at.some(i => i < 0)) throw new PolishError("Part of that selection is no longer on the page. Select it again.", 409);
    const first = Math.min(...at), last = Math.max(...at);
    if (last - first + 1 !== ids.length) throw new PolishError("Select one continuous part of the page to polish.");
    range = top.slice(first, last + 1);
  }
  const lines: string[] = [], keep: string[] = [], blocks: string[] = [], texts = new Map<string, string[]>();
  for (const node of range) {
    const id = typeof node.attrs?.id === "string" ? node.attrs.id : "";
    if (!id) throw new PolishError("This page is still loading its block ids. Try again in a moment.", 409);
    blocks.push(id);
    if (TEXT_BLOCKS.has(node.type ?? "") && textOnly(node)) {
      const md = notebookBlockMarkdown(node).trim();
      if (md) { lines.push(md); texts.set(md, [...(texts.get(md) ?? []), id]); }
      continue;
    }
    lines.push(`[[keep ${keep.length}]]`);
    keep.push(id);
  }
  if (!texts.size) throw new PolishError("There's no typed text here to polish.");
  const markdown = lines.join("\n\n");
  if (markdown.length > POLISH_LIMIT) throw new PolishError(`That's too much text to polish at once (over ${POLISH_LIMIT.toLocaleString()} characters). Select part of the page and polish that.`, 413);
  return { markdown, keep, blocks, texts };
}

/** Bruno's reply as blocks, keep lines as placeholders for the originals. A
 *  reply that loses, repeats or reorders a keep line is refused whole. A block
 *  that comes back word for word is the original too (a placeholder for it),
 *  nested items and their ids included, so links, comments and drawings
 *  pinned anywhere inside it stay put. */
export function polishResult(reply: string, source: Pick<PolishSource, "keep" | "texts">): JSONContent[] {
  let text = String(reply ?? "").replace(/\r\n?/g, "\n").trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) text = fenced[1].trim();
  if (!text) throw new PolishError("Bruno came back empty. Try again.", 502);
  const out: JSONContent[] = [], seen: number[] = [];
  // Repeated text (two "TBD" lines) matches its blocks one each, in order.
  const unused = new Map([...source.texts].map(([md, ids]) => [md, [...ids]]));
  let buffer: string[] = [];
  const flush = () => {
    const segment = buffer.join("\n").trim(); buffer = [];
    if (!segment) return;
    for (const block of markdownToNotebookBlocks(segment)) {
      const same = unused.get(notebookBlockMarkdown(block).trim())?.shift();
      out.push(same ? { type: KEEP_NODE, attrs: { id: same } } : block);
    }
  };
  for (const line of text.split("\n")) {
    const m = KEEP_LINE.exec(line);
    if (!m) { buffer.push(line); continue; }
    flush();
    const n = Number(m[1]);
    seen.push(n);
    if (n < source.keep.length) out.push({ type: KEEP_NODE, attrs: { id: source.keep[n] } });
  }
  flush();
  if (seen.length !== source.keep.length || seen.some((n, i) => n !== i)) throw new PolishError("Bruno moved or dropped a picture, table or file, so its version wasn't used. Try again.", 502);
  if (out.length <= source.keep.length) throw new PolishError("Bruno came back without any text. Try again.", 502);
  return out;
}

// Negations ("not", "no", "never") and short units ("mm", "cm", "kg") always count: losing one changes the meaning.
const STOP = new Set("the and for are but you all any can had her was one our out has him his how its may new now see two way who did get let put say she too use that with have this will your from they been were what when them than then into just like over such some only also very would could should there their these those which about after before where while being".split(" "));
const STOP2 = new Set("am an as at be by do he if in is it me my of on or so to up us we".split(" "));
/** Words that matter (any number, 2+ letters but filler), lowercased, Markdown and keep lines left out. */
function words(markdown: string): Set<string> {
  // List numbers are formatting, not notes: "1." added in front of steps is not a new fact.
  const plain = markdown.replace(/\[\[keep \d+\]\]/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/^\s*\d+[.)]\s/gm, " ").toLowerCase();
  // Numbers apart from their units, so "48mm" and "48 mm" read the same.
  const found = plain.match(/\p{N}+(?:[.,]\p{N}+)*|\p{L}[\p{L}'’-]*/gu) ?? [];
  return new Set(found.map(w => w.replace(/['’-]+$/, "")).filter(w => /\d/.test(w) || (w.length >= 3 ? !STOP.has(w) : w.length === 2 && !STOP2.has(w))));
}
/** What the member should look at before applying: notes Bruno left out, and words it brought in (usually headings). */
export function wordChanges(before: string, after: string): { dropped: string[]; added: string[] } {
  const a = words(before), b = words(after);
  return { dropped: [...a].filter(w => !b.has(w)).slice(0, 30), added: [...b].filter(w => !a.has(w)).slice(0, 30) };
}
