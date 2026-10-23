// A notebook page as a Markdown file (feature parity 3.5): headings, lists,
// checklists, quotes, code, tables, links and inline marks, with the title
// and date on top. Attachments and drawings can't be text, so they're named
// ("[file: intake.pdf]", "[drawing: 3 strokes, 1 shape]") rather than
// dropped silently; text boxes on the canvas are kept. Pure.
//
// Blocks are built as lists of lines and joined with one blank line, so the
// user's own text (code especially) is never rewritten afterwards.

import { entryMetaSummary, type EntryMeta } from './entryMeta';

type PMMark = { type?: string; attrs?: Record<string, any> };
type PMNode = { type?: string; text?: string; attrs?: Record<string, any>; content?: PMNode[]; marks?: PMMark[] };

/** Plain text with Markdown's inline syntax characters escaped. */
const escapeInline = (s: string) => s.replace(/([\\`*_[\]#<>|~])/g, '\\$1');

/** Escapes what would start a block at the beginning of a line ("1. ", "- ", "+ ", "> "). */
const escapeLineStart = (line: string) => line.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4').replace(/^(\s*)([-+])(\s)/, '$1\\$2$3');

/** A backtick run one longer than any in the text (at least `min`). */
const fenceFor = (text: string, min: number) => '`'.repeat(Math.max(min, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));

function marked(node: PMNode): string {
  const raw = node.text ?? '';
  if (!raw) return '';
  const marks = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);
  // Code keeps every character, edge spaces included: CommonMark drops one
  // space on each side when both are present, so pad those (and backticks).
  // Other marks keep edge spaces outside the markers, or Markdown won't see them.
  const isCode = has('code');
  const [, lead, core, trail] = isCode ? ['', '', raw, ''] : /^(\s*)([\s\S]*?)(\s*)$/.exec(raw)!;
  if (!core) return raw;
  let t: string;
  if (isCode) {
    const fence = fenceFor(core, 1);
    const pad = core.startsWith('`') || core.endsWith('`') || (/^ /.test(core) && / $/.test(core) && core.trim()) ? ' ' : '';
    t = `${fence}${pad}${core}${pad}${fence}`;
  } else t = escapeInline(core);
  if (has('bold')) t = `**${t}**`;
  if (has('italic')) t = `*${t}*`;
  if (has('strike')) t = `~~${t}~~`;
  const link = marks.find((m) => m.type === 'link');
  const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
  if (href && /^(https?:|mailto:|\/)/i.test(href)) t = `[${t}](${href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20').replace(/</g, '%3C').replace(/>/g, '%3E')})`;
  return `${lead}${t}${trail}`;
}

/** Inline content of a block (hard breaks become Markdown line breaks). */
function inline(node: PMNode | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return marked(node);
  if (node.type === 'hardBreak') return '\\\n';
  if (node.type === 'notebookFile') return `[file: ${escapeInline(String(node.attrs?.name ?? 'attachment'))}]`;
  if (node.type === 'image') return `[image${node.attrs?.alt ? `: ${escapeInline(String(node.attrs.alt))}` : ''}]`;
  return (node.content ?? []).map(inline).join('');
}

/** Joins child blocks with one blank line between them. */
const joinBlocks = (blocks: string[][]) => blocks.filter((b) => b.length).flatMap((b, i) => (i ? ['', ...b] : b));

/** One block as lines (no surrounding blank lines). */
function block(node: PMNode): string[] {
  switch (node.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)))} ${inline(node).replace(/\\\n/g, ' ')}`];
    case 'paragraph': {
      const text = inline(node);
      return text ? text.split('\n').map((l, i) => (i ? l : escapeLineStart(l))) : [];
    }
    case 'blockquote':
      return joinBlocks((node.content ?? []).map(block)).map((l) => (l ? `> ${l}` : '>'));
    case 'codeBlock': {
      const code = (node.content ?? []).map((c) => c.text ?? '').join('');
      const fence = fenceFor(code, 3);
      return [`${fence}${String(node.attrs?.language ?? '').replace(/[`\s]/g, '')}`, ...code.split('\n'), fence];
    }
    case 'horizontalRule':
      return ['---'];
    case 'bulletList': case 'orderedList': case 'taskList': {
      const out: string[] = [];
      let n = Number(node.attrs?.start) || 1;
      for (const item of node.content ?? []) {
        const marker = node.type === 'orderedList' ? `${n++}.` : node.type === 'taskList' ? (item.attrs?.checked ? '- [x]' : '- [ ]') : '-';
        // Children line up under the item's text, so they stay inside it.
        const indent = ' '.repeat((node.type === 'taskList' ? 2 : marker.length + 1));
        const [first, ...rest] = item.content ?? [];
        const head = first ? block(first) : [];
        out.push(`${marker} ${head[0] ?? ''}`, ...head.slice(1).map((l) => (l ? indent + l : l)));
        const nested = rest.map(block).filter((b) => b.length);
        for (const b of nested) {
          // A nested list continues the item directly; other blocks need a blank line.
          const isList = b[0] && /^(\d+\.|-) /.test(b[0]);
          if (!isList) out.push('');
          out.push(...b.map((l) => (l ? indent + l : l)));
        }
      }
      return out;
    }
    case 'table': {
      const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map(inline).join(' ').replace(/\\\n/g, ' ').replace(/\n/g, ' ').replace(/(?<!\\)\|/g, '\\|')));
      if (!rows.length) return [];
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
      return [`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(' | ')} |`)];
    }
    case 'notebookFile':
      return [`[file: ${escapeInline(String(node.attrs?.name ?? 'attachment'))}]`];
    default: {
      const text = inline(node);
      return text ? [text] : [];
    }
  }
}

/** One block as Markdown, e.g. for Bruno's Polish. */
export const notebookBlockMarkdown = (node: unknown): string => block(node as PMNode).join('\n');

/** The canvas (drawings, shapes, images, text boxes) as text: text boxes kept, the rest named. */
function canvasBlocks(canvas: unknown): string[][] {
  const objects: any[] = (canvas as any)?.version === 1 && Array.isArray((canvas as any).objects) ? (canvas as any).objects : [];
  if (!objects.length) return [];
  const count = (type: string) => objects.filter((o) => o?.type === type).length;
  const named = [['stroke', 'stroke'], ['shape', 'shape'], ['image', 'image']]
    .map(([type, word]) => { const n = count(type); return n ? `${n} ${word}${n === 1 ? '' : 's'}` : ''; }).filter(Boolean);
  const out: string[][] = [];
  if (named.length) out.push([`[drawing: ${named.join(', ')}]`]);
  const texts = objects.filter((o) => o?.type === 'text').map((o) => joinBlocks(((o.content?.content ?? []) as PMNode[]).map(block))).filter((b) => b.length);
  if (texts.length) out.push(['Text boxes on the page:'], ...texts);
  return out;
}

/** The page as Markdown: a title heading, a date line, then the content and canvas. */
export function notebookPageMarkdown(page: { title?: string; content?: unknown; canvas?: unknown; createdAt?: string | null }, details: string[] = []): string {
  const blocks: string[][] = [[`# ${escapeInline((page.title || 'Untitled page').replace(/\s+/g, ' ').trim())}`]];
  const meta: string[] = [];
  if (page.createdAt) {
    const d = new Date(page.createdAt);
    if (!Number.isNaN(d.getTime())) meta.push(`Written ${d.toISOString().slice(0, 10)}`);
  }
  meta.push(...details.filter(Boolean).map(escapeInline));
  if (meta.length) blocks.push([`*${meta.join(' · ')}*`]);
  const doc = page.content as PMNode | PMNode[] | undefined;
  for (const b of Array.isArray(doc) ? doc : doc?.content ?? []) blocks.push(block(b));
  blocks.push(...canvasBlocks(page.canvas));
  return `${joinBlocks(blocks).join('\n')}\n`;
}

/** A safe file name for the page ("Intake v3: lower roller" → "intake-v3-lower-roller.md"). */
export function markdownFileName(title: string | undefined): string {
  const base = String(title || 'notebook-page').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80);
  return `${base || 'notebook-page'}.md`;
}

/** The page's entry details as one export line (type, stage, work date, subsystems, awards), or none. */
export function entryDetailsLine(entry: EntryMeta | null | undefined): string[] {
  if (!entry) return [];
  const set = Object.fromEntries(Object.entries(entry).filter(([k, v]) => k !== 'updatedAt' && v !== null && !(Array.isArray(v) && !v.length)));
  const text = entryMetaSummary(set);
  return text ? [text.charAt(0).toUpperCase() + text.slice(1)] : [];
}
