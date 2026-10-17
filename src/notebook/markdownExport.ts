// A notebook page as a Markdown file (feature parity 3.5): headings, lists,
// checklists, quotes, code, tables, links and inline marks, with the title
// and date on top. Attachments and drawings can't be text, so they're named
// ("[file: intake.pdf]", "[drawing]") rather than dropped silently. Pure.

type PMMark = { type?: string; attrs?: Record<string, any> };
type PMNode = { type?: string; text?: string; attrs?: Record<string, any>; content?: PMNode[]; marks?: PMMark[] };

const escapeText = (s: string) => s.replace(/([\\`*_[\]#<>|])/g, '\\$1');

function marked(node: PMNode): string {
  let t = escapeText(node.text ?? '');
  if (!t) return '';
  const marks = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);
  if (has('code')) t = '`' + (node.text ?? '').replace(/`/g, 'ˋ') + '`';
  if (has('bold')) t = `**${t}**`;
  if (has('italic')) t = `*${t}*`;
  if (has('strike')) t = `~~${t}~~`;
  const link = marks.find((m) => m.type === 'link');
  const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
  if (href && /^(https?:|mailto:|\/)/i.test(href)) t = `[${t}](${href.replace(/\)/g, '%29').replace(/ /g, '%20')})`;
  return t;
}

/** Inline content of a block as one Markdown line (hard breaks become line breaks). */
function inline(node: PMNode | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return marked(node);
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'notebookFile') return `[file: ${String(node.attrs?.name ?? 'attachment')}]`;
  if (node.type === 'image') return `[image${node.attrs?.alt ? `: ${node.attrs.alt}` : ''}]`;
  return (node.content ?? []).map(inline).join('');
}

function block(node: PMNode, out: string[], indent = '') {
  switch (node.type) {
    case 'heading':
      out.push(`${'#'.repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)))} ${inline(node)}`, '');
      return;
    case 'paragraph': {
      const text = inline(node);
      out.push(indent + text.replace(/\n/g, `\n${indent}`), '');
      return;
    }
    case 'blockquote': {
      const inner: string[] = [];
      for (const c of node.content ?? []) block(c, inner);
      while (inner.length && inner[inner.length - 1] === '') inner.pop();
      out.push(...inner.map((l) => (l ? `> ${l}` : '>')), '');
      return;
    }
    case 'codeBlock':
      out.push('```' + String(node.attrs?.language ?? ''), (node.content ?? []).map((c) => c.text ?? '').join(''), '```', '');
      return;
    case 'horizontalRule':
      out.push('---', '');
      return;
    case 'bulletList': case 'orderedList': case 'taskList': {
      let n = Number(node.attrs?.start) || 1;
      for (const item of node.content ?? []) {
        const marker = node.type === 'orderedList' ? `${n++}.` : node.type === 'taskList' ? (item.attrs?.checked ? '- [x]' : '- [ ]') : '-';
        const [first, ...rest] = item.content ?? [];
        out.push(`${indent}${marker} ${first ? inline(first) : ''}`);
        for (const child of rest) {
          const nested: string[] = [];
          block(child, nested, `${indent}  `);
          out.push(...nested.filter((l) => l !== ''));
        }
      }
      out.push('');
      return;
    }
    case 'table': {
      const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map(inline).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ')));
      if (!rows.length) return;
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
      out.push(`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(' | ')} |`), '');
      return;
    }
    case 'notebookFile':
      out.push(`[file: ${String(node.attrs?.name ?? 'attachment')}]`, '');
      return;
    case 'drawing': case 'inkBlock': case 'canvas':
      out.push('[drawing]', '');
      return;
    default: {
      const text = inline(node);
      if (text) out.push(indent + text, '');
    }
  }
}

/** The page as Markdown: a title heading, a date line, then the content. */
export function notebookPageMarkdown(page: { title?: string; content?: unknown; createdAt?: string | null }, details: string[] = []): string {
  const out: string[] = [`# ${(page.title || 'Untitled page').replace(/\n/g, ' ')}`, ''];
  const meta: string[] = [];
  if (page.createdAt) {
    const d = new Date(page.createdAt);
    if (!Number.isNaN(d.getTime())) meta.push(`Written ${d.toISOString().slice(0, 10)}`);
  }
  meta.push(...details.filter(Boolean));
  if (meta.length) out.push(`*${meta.join(' · ')}*`, '');
  const doc = page.content as PMNode | PMNode[] | undefined;
  const blocks = Array.isArray(doc) ? doc : doc?.content ?? [];
  for (const b of blocks) block(b, out);
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** A safe file name for the page ("Intake v3: lower roller" → "intake-v3-lower-roller.md"). */
export function markdownFileName(title: string | undefined): string {
  const base = String(title || 'notebook-page').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80);
  return `${base || 'notebook-page'}.md`;
}
