// Home → Find Tags: every tagged block (To Do, Important, Question, Remember
// for later) in the pages a member can see, for the tag summary. Only the
// page flow is read; protected pages are filtered out before this runs.

export const NOTEBOOK_TAG_NAMES = ["todo", "important", "question", "remember"] as const;
export type NotebookTagName = (typeof NOTEBOOK_TAG_NAMES)[number];
export type TaggedBlock = { pageId: number; pageTitle: string; sectionId: number; blockId: string | null; tag: NotebookTagName; text: string; done: boolean | null; updatedAt: string };

export const MAX_TAGGED_BLOCKS = 500;
const TEXT_LIMIT = 200;

type Node = { type?: string; attrs?: Record<string, unknown>; text?: string; content?: Node[] };

// Saved documents are checked loosely on the way in, so walk defensively:
// anything that isn't a list of objects is skipped, not trusted.
const children = (node: Node): Node[] => Array.isArray(node.content) ? node.content.filter(c => c && typeof c === "object") : [];

function plain(node: Node, out: string[] = [], depth = 0): string[] {
  if (depth > 60) return out;
  if (typeof node.text === "string") out.push(node.text);
  if (node.type === "hardBreak") out.push(" ");
  for (const child of children(node)) {
    plain(child, out, depth + 1);
    if (child.type && !child.text && child.type !== "hardBreak") out.push(" ");
  }
  return out;
}
const textOf = (node: Node) => plain(node).join("").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);

/** Tagged blocks in one page's content, in document order. A tagged block's
 *  own nested tags are listed too (e.g. a tagged item in a tagged list). */
export function taggedBlocks(content: unknown, page: { id: number; title: string; sectionId: number; updatedAt: string }, limit = MAX_TAGGED_BLOCKS): TaggedBlock[] {
  const found: TaggedBlock[] = [];
  // `task` is the checked state of the task item we're inside, if any:
  // Home → Tag puts the tag on a task's paragraph, not the task itself.
  const walk = (node: Node, depth: number, task: boolean | null) => {
    if (found.length >= limit || depth > 60 || !node || typeof node !== "object") return;
    if (node.type === "taskItem") task = !!node.attrs?.checked;
    const tag = node.attrs && typeof node.attrs === "object" ? node.attrs.nbTag : undefined;
    if (typeof tag === "string" && (NOTEBOOK_TAG_NAMES as readonly string[]).includes(tag)) {
      found.push({
        pageId: page.id, pageTitle: page.title, sectionId: page.sectionId,
        blockId: typeof node.attrs?.id === "string" ? node.attrs.id : null,
        tag: tag as NotebookTagName, text: textOf(node),
        done: task, updatedAt: page.updatedAt,
      });
    }
    for (const child of children(node)) walk(child, depth + 1, task);
  };
  const doc = typeof content === "string" ? (() => { try { return JSON.parse(content); } catch { return null; } })() : content;
  if (doc && typeof doc === "object") walk(Array.isArray(doc) ? { content: doc } : doc as Node, 0, null);
  return found;
}
