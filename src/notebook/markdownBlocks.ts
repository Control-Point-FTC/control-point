// Markdown (as Bruno writes it) -> real notebook blocks: headings, lists,
// checklists, tables, quotes, code and inline formatting become editable
// nodes, never a pasted wall of text. Unsafe links lose their link mark;
// anything the notebook schema can't hold is kept as plain text.
import type { JSONContent } from '@tiptap/core';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { safeNotebookLink } from './editorSchema';

export const MARKDOWN_LIMIT = 20_000;
const MAX_BLOCKS = 400;
const LANGUAGES = new Set(['plaintext', 'javascript', 'typescript', 'java', 'kotlin', 'python', 'cpp', 'json', 'bash']);

type Mark = { type: string; attrs?: Record<string, unknown> };
type MdNode = { type: string; value?: string; depth?: number; ordered?: boolean | null; start?: number | null; checked?: boolean | null; lang?: string | null; url?: string; children?: MdNode[] };

const newId = () => globalThis.crypto.randomUUID();

function inlines(nodes: MdNode[] = [], marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const add = (extra: Mark) => out.push(...inlines(n.children, [...marks.filter(m => m.type !== extra.type), extra]));
    switch (n.type) {
      case 'text': if (n.value) out.push(marks.length ? { type: 'text', text: n.value, marks } : { type: 'text', text: n.value }); break;
      case 'inlineCode': if (n.value) out.push({ type: 'text', text: n.value, marks: [...marks.filter(m => m.type === 'link'), { type: 'code' }] }); break;
      case 'strong': add({ type: 'bold' }); break;
      case 'emphasis': add({ type: 'italic' }); break;
      case 'delete': add({ type: 'strike' }); break;
      case 'link': if (n.url && safeNotebookLink(n.url) && /^(https?:|mailto:|tel:|\/)/i.test(n.url)) add({ type: 'link', attrs: { href: n.url } }); else out.push(...inlines(n.children, marks)); break;
      case 'break': out.push({ type: 'hardBreak' }); break;
      // Images and raw HTML become their text: no remote fetches, no markup.
      case 'image': case 'html': if (n.value) out.push({ type: 'text', text: n.value }); break;
      default: out.push(...inlines(n.children, marks));
    }
  }
  // Adjacent text nodes with identical marks merge (ProseMirror normalises them anyway).
  return out.filter(n => n.type !== 'text' || n.text);
}

const paragraph = (content: JSONContent[]): JSONContent => ({ type: 'paragraph', attrs: { id: newId() }, ...(content.length ? { content } : {}) });

function blocks(nodes: MdNode[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'heading': out.push({ type: 'heading', attrs: { id: newId(), level: Math.min(6, Math.max(1, n.depth ?? 2)) }, content: inlines(n.children) }); break;
      case 'paragraph': out.push(paragraph(inlines(n.children))); break;
      case 'blockquote': { const inner = blocks(n.children); out.push({ type: 'blockquote', attrs: { id: newId() }, content: inner.length ? inner : [paragraph([])] }); break; }
      case 'code': {
        const lang = String(n.lang ?? '').toLowerCase();
        out.push({ type: 'codeBlock', attrs: { id: newId(), language: LANGUAGES.has(lang) ? lang : null }, ...(n.value ? { content: [{ type: 'text', text: n.value }] } : {}) });
        break;
      }
      case 'thematicBreak': out.push({ type: 'horizontalRule', attrs: { id: newId() } }); break;
      case 'list': {
        const items = n.children ?? [];
        const isTask = items.length > 0 && items.every(i => typeof i.checked === 'boolean');
        const itemContent = (i: MdNode) => { const c = blocks(i.children); return c.length && c[0].type === 'paragraph' ? c : [paragraph([]), ...c]; };
        if (isTask) out.push({ type: 'taskList', attrs: { id: newId() }, content: items.map(i => ({ type: 'taskItem', attrs: { id: newId(), checked: !!i.checked }, content: itemContent(i) })) });
        else out.push({ type: n.ordered ? 'orderedList' : 'bulletList', attrs: { id: newId(), ...(n.ordered && n.start && n.start > 1 ? { start: n.start } : {}) }, content: items.map(i => ({ type: 'listItem', attrs: { id: newId() }, content: itemContent(i) })) });
        break;
      }
      case 'table': {
        const rows = n.children ?? [];
        const width = Math.max(1, ...rows.map(r => r.children?.length ?? 0));
        out.push({ type: 'table', attrs: { id: newId() }, content: rows.map((row, r) => ({ type: 'tableRow', attrs: { id: newId() }, content: Array.from({ length: width }, (_, c) => ({
          type: r === 0 ? 'tableHeader' : 'tableCell', attrs: { id: newId() }, content: [paragraph(inlines(row.children?.[c]?.children))],
        })) })) });
        break;
      }
      case 'html': if (n.value?.trim()) out.push(paragraph([{ type: 'text', text: n.value }])); break;
      default: if (n.children) out.push(...blocks(n.children));
    }
    if (out.length > MAX_BLOCKS) break;
  }
  return out.slice(0, MAX_BLOCKS);
}

/** Top-level notebook blocks (with fresh ids) for a Markdown string. */
export function markdownToNotebookBlocks(markdown: string): JSONContent[] {
  const source = String(markdown ?? '').replace(/\r\n?/g, '\n').slice(0, MARKDOWN_LIMIT);
  if (!source.trim()) return [];
  const tree = fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdNode;
  return blocks(tree.children);
}
