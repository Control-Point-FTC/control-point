// Type "/" at the start of a line for a menu of blocks (headings, lists,
// to-dos, quote, code, divider, table). Keep typing to filter; arrows move,
// Enter or Tab picks, Escape closes. The "/command" text is replaced by the
// block. Code blocks are left alone.
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export type SlashItem = { id: string; label: string; hint: string; keywords: string; run: (editor: Editor, range: { from: number; to: number }) => void };
export type SlashState = { active: boolean; from: number; to: number; query: string; index: number; dismissed: number | null };

const chainAt = (editor: Editor, range: { from: number; to: number }) => editor.chain().focus().deleteRange(range);
export const SLASH_ITEMS: SlashItem[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', keywords: 'paragraph normal body', run: (e, r) => chainAt(e, r).setParagraph().run() },
  { id: 'h1', label: 'Heading 1', hint: 'Big section title', keywords: 'title h1', run: (e, r) => chainAt(e, r).setHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', keywords: 'subtitle h2', run: (e, r) => chainAt(e, r).setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', keywords: 'h3', run: (e, r) => chainAt(e, r).setHeading({ level: 3 }).run() },
  { id: 'bullets', label: 'Bulleted list', hint: '• Items', keywords: 'bullet unordered ul', run: (e, r) => chainAt(e, r).toggleBulletList().run() },
  { id: 'numbers', label: 'Numbered list', hint: '1. Steps', keywords: 'numbered ordered ol', run: (e, r) => chainAt(e, r).toggleOrderedList().run() },
  { id: 'todo', label: 'To-do list', hint: '☐ Tasks to check off', keywords: 'task checkbox checklist todo', run: (e, r) => chainAt(e, r).toggleTaskList().run() },
  { id: 'quote', label: 'Quote', hint: 'Set text apart', keywords: 'blockquote callout', run: (e, r) => chainAt(e, r).setParagraph().toggleBlockquote().run() },
  { id: 'code', label: 'Code block', hint: 'Code with spacing kept', keywords: 'code snippet program', run: (e, r) => chainAt(e, r).setCodeBlock().run() },
  { id: 'divider', label: 'Divider', hint: 'A line across the page', keywords: 'horizontal rule hr line separator', run: (e, r) => chainAt(e, r).setHorizontalRule().run() },
  { id: 'table', label: 'Table', hint: '3 × 3 with a header row', keywords: 'grid rows columns', run: (e, r) => chainAt(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
];

export function slashMatches(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(item => item.label.toLowerCase().includes(q) || item.keywords.includes(q));
}

export const slashKey = new PluginKey<SlashState>('notebookSlash');
const idle: SlashState = { active: false, from: 0, to: 0, query: '', index: 0, dismissed: null };

export const SlashMenu = Extension.create<{ enabled: () => boolean }>({
  name: 'notebookSlashMenu',
  // Off where the menu can't be shown (the phone layout is text-only).
  addOptions() { return { enabled: () => true }; },
  addProseMirrorPlugins() {
    const editor = this.editor, enabled = () => this.options.enabled();
    const pick = (state: SlashState, item: SlashItem | undefined) => {
      if (!item) return false;
      item.run(editor, { from: state.from, to: state.to });
      return true;
    };
    return [new Plugin<SlashState>({
      key: slashKey,
      state: {
        init: () => idle,
        apply(tr, prev, _old, next) {
          const meta = tr.getMeta(slashKey) as Partial<SlashState> | undefined;
          const { selection } = next;
          const $from = selection.$from;
          const parent = $from.parent;
          const text = selection.empty && parent.isTextblock && !parent.type.spec.code ? parent.textBetween(0, $from.parentOffset, '\0', '\0') : '';
          const match = /^\/([\w -]{0,24})$/.exec(text);
          if (!match || !enabled()) return idle;
          const from = $from.start();
          // Escape keeps it closed until this "/" is gone.
          const dismissed = meta?.dismissed !== undefined ? meta.dismissed : prev.dismissed === from ? from : null;
          if (dismissed === from) return { ...idle, dismissed };
          const query = match[1];
          const count = slashMatches(query).length;
          const index = meta?.index !== undefined ? meta.index : prev.active && prev.query === query ? prev.index : 0;
          return { active: count > 0, from, to: $from.pos, query, index: Math.max(0, Math.min(count - 1, index)), dismissed: null };
        },
      },
      props: {
        handleKeyDown(view, event) {
          const state = slashKey.getState(view.state);
          if (!state?.active) return false;
          const items = slashMatches(state.query);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const step = event.key === 'ArrowDown' ? 1 : -1;
            view.dispatch(view.state.tr.setMeta(slashKey, { index: (state.index + step + items.length) % items.length }));
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') return pick(state, items[state.index]);
          if (event.key === 'Escape') { view.dispatch(view.state.tr.setMeta(slashKey, { dismissed: state.from })); return true; }
          return false;
        },
      },
    })];
  },
});
