import { Extension, getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit, FontFamily, FontSize, Color, BackgroundColor } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import UniqueID from '@tiptap/extension-unique-id';
import { Plugin } from '@tiptap/pm/state';
import { normalizeNotebookLink } from './pageLinks';

// System fonts require no CDN or redistribution. Every choice has a portable
// fallback so a note remains readable on a device without that particular face.
export const NOTEBOOK_FONTS = [
  { label: 'System sans', value: 'system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
] as const;
export const NOTEBOOK_COLORS = ['#171717', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
export const NOTEBOOK_TAGS = ['todo', 'important', 'question', 'remember'] as const;
export const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'horizontalRule', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'table', 'tableRow', 'tableCell', 'tableHeader'];
export const DOCUMENT_SCHEMA_VERSION = 1;

export function safeNotebookColor(value: unknown): string | null {
  return typeof value === 'string' && /^(#[a-f\d]{3,8}|[a-z]{1,20}|rgba?\([\d.,%\s]+\))$/i.test(value) ? value : null;
}
export function safeNotebookLink(value: string): boolean {
  try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value, 'https://control-point.invalid').protocol); } catch { return false; }
}
function font(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return NOTEBOOK_FONTS.find(f => f.value === value || f.label.toLowerCase() === value.replaceAll('"', '').split(',')[0].trim().toLowerCase())?.value ?? null;
}
function size(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(String(value).replace(/(?:px|pt)$/, ''));
  return Number.isFinite(n) && n >= 8 && n <= 96 ? `${n}px` : null;
}
const SafeFontFamily = FontFamily.extend({
  addGlobalAttributes() { return [{ types: ['textStyle'], attributes: { fontFamily: {
    default: null, parseHTML: (element: HTMLElement) => font(element.style.fontFamily),
    renderHTML: (attrs: Record<string, unknown>) => font(attrs.fontFamily) ? { style: `font-family: ${font(attrs.fontFamily)}` } : {},
  } } }]; },
});
const SafeFontSize = FontSize.extend({
  addGlobalAttributes() { return [{ types: ['textStyle'], attributes: { fontSize: {
    default: null, parseHTML: (element: HTMLElement) => size(element.style.fontSize),
    renderHTML: (attrs: Record<string, unknown>) => size(attrs.fontSize) ? { style: `font-size: ${size(attrs.fontSize)}` } : {},
  } } }]; },
});
function safeColorExtension(base: typeof Color | typeof BackgroundColor, name: 'color' | 'backgroundColor', css: string) {
  return base.extend({ addGlobalAttributes() { return [{ types: ['textStyle'], attributes: { [name]: {
    default: null, parseHTML: (element: HTMLElement) => safeNotebookColor(element.style[name]),
    renderHTML: (attrs: Record<string, unknown>) => safeNotebookColor(attrs[name]) ? { style: `${css}: ${safeNotebookColor(attrs[name])}` } : {},
  } } }]; } });
}
const Blocks = Extension.create({
  name: 'notebookBlocks',
  addGlobalAttributes() { return [{ types: BLOCK_TYPES, attributes: {
    nbTag: {
      default: null,
      parseHTML: (element: HTMLElement) => NOTEBOOK_TAGS.includes(element.dataset.nbTag as any) ? element.dataset.nbTag : null,
      renderHTML: (attrs: Record<string, unknown>) => NOTEBOOK_TAGS.includes(attrs.nbTag as any) ? { 'data-nb-tag': attrs.nbTag } : {},
    },
    indent: {
      default: 0,
      parseHTML: (element: HTMLElement) => Math.min(6, Math.max(0, Number(element.dataset.nbIndent) || 0)),
      renderHTML: (attrs: Record<string, unknown>) => {
        const n = Math.min(6, Math.max(0, Number(attrs.indent) || 0));
        return n ? { 'data-nb-indent': n, style: `margin-inline-start: ${n * 1.5}em` } : {};
      },
    },
  } }]; },
});
const shading = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => safeNotebookColor(element.style.backgroundColor),
    renderHTML: (attrs: Record<string, unknown>) => safeNotebookColor(attrs.backgroundColor) ? { style: `background-color: ${safeNotebookColor(attrs.backgroundColor)}` } : {},
  },
};
const ShadedCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...shading }; } });
const ShadedHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...shading }; } });
const InternalLinks = Extension.create({
  name: 'notebookInternalLinks',
  addProseMirrorPlugins() { return [new Plugin({ appendTransaction(transactions, _old, state) {
    if (!transactions.some(t => t.docChanged) || typeof window === 'undefined') return null;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      for (const mark of node.marks) {
        if (mark.type.name !== 'link' || typeof mark.attrs.href !== 'string') continue;
        const href = normalizeNotebookLink(mark.attrs.href, window.location.origin);
        if (href !== mark.attrs.href) tr.removeMark(pos, pos + node.nodeSize, mark).addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, href }));
      }
    });
    return tr.docChanged ? tr : null;
  } })]; },
});

/** Shared by the real editor and server conversion: schema drift loses data. */
export function notebookExtensions(collaborative = false, updateDocument = true) {
  return [
    StarterKit.configure({ undoRedo: collaborative ? false : { depth: 100 }, link: { openOnClick: false, HTMLAttributes: { rel: 'noreferrer', target: '_blank' }, isAllowedUri: safeNotebookLink } }),
    TextStyleKit.configure({ fontFamily: false, fontSize: false, color: false, backgroundColor: false }),
    SafeFontFamily, SafeFontSize, safeColorExtension(Color, 'color', 'color'), safeColorExtension(BackgroundColor, 'backgroundColor', 'background-color'),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: true }), Subscript, Superscript,
    TaskList, TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }), TableRow, ShadedCell, ShadedHeader,
    UniqueID.configure({ types: BLOCK_TYPES, updateDocument }), Blocks, InternalLinks,
  ];
}
export const notebookSchema = getSchema(notebookExtensions(true));

/** Unknown documents stay intact and get a recovery error, not a blank editor. */
export function validatedNotebookDocument(value: unknown): JSONContent {
  if (Array.isArray(value) && value.length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] };
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as any).type !== 'doc') throw new Error('This document needs a compatible notebook editor. Download its source before converting it.');
  try {
    const node = notebookSchema.nodeFromJSON(value);
    node.check();
    // nodeFromJSON ignores unknown attributes; reject them rather than silently
    // dropping a newer editor's fields during the next autosave.
    const validate = (json: any) => {
      for (const key of Object.keys(json)) if (!['type', 'attrs', 'content', 'marks', 'text'].includes(key)) throw new Error('Unknown notebook field');
      const type = notebookSchema.nodes[json.type];
      if (!type) throw new Error('Unknown notebook block');
      for (const key of Object.keys(json.attrs ?? {})) if (!Object.hasOwn(type.spec.attrs ?? {}, key)) throw new Error('Unknown notebook attribute');
      for (const mark of json.marks ?? []) {
        for (const key of Object.keys(mark)) if (!['type', 'attrs'].includes(key)) throw new Error('Unknown notebook format field');
        const markType = notebookSchema.marks[mark.type];
        if (!markType) throw new Error('Unknown notebook format');
        for (const key of Object.keys(mark.attrs ?? {})) if (!Object.hasOwn(markType.spec.attrs ?? {}, key)) throw new Error('Unknown notebook attribute');
      }
      for (const child of json.content ?? []) validate(child);
    };
    validate(value);
    return value as JSONContent;
  } catch { throw new Error('This document contains an unsupported block or format. Its source has been preserved.'); }
}
