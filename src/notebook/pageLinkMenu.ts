// Type "[[" to link another page: a list of the pages you can see, filtered
// as you type; Enter or Tab inserts the page's title as a link that keeps
// working when the page is renamed or moved. Escape closes it until that
// "[[" is gone. Not in code.
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { notebookPageLink } from './pageLinks';
import type { NotebookPageItem } from './types';

export type PageLinkState = { active: boolean; from: number; to: number; query: string; index: number; dismissed: number | null };
export const pageLinkKey = new PluginKey<PageLinkState>('notebookPageLink');
const idle: PageLinkState = { active: false, from: 0, to: 0, query: '', index: 0, dismissed: null };
const MAX_RESULTS = 8;

export function pageMatches(pages: NotebookPageItem[], query: string, currentPageId?: number): NotebookPageItem[] {
  const q = query.trim().toLowerCase();
  const others = pages.filter(p => p.id !== currentPageId);
  const scored = others.map(p => ({ p, title: (p.title || 'Untitled').toLowerCase() }))
    .filter(x => !q || x.title.includes(q))
    .sort((a, b) => (q ? Number(!a.title.startsWith(q)) - Number(!b.title.startsWith(q)) : 0) || a.title.localeCompare(b.title));
  return scored.slice(0, MAX_RESULTS).map(x => x.p);
}

export function insertPageLink(editor: Editor, range: { from: number; to: number }, page: NotebookPageItem) {
  // Editing may have stopped (conflict, permission change) since the list opened.
  if (!editor.isEditable) return;
  editor.chain().focus().deleteRange(range)
    .insertContent([{ type: 'text', text: page.title || 'Untitled', marks: [{ type: 'link', attrs: { href: notebookPageLink(page.id) } }] }, { type: 'text', text: ' ' }])
    .run();
}

/** Where page links come from; shared with canvas text boxes on the page. */
export type PageLinkSource = { pages: () => NotebookPageItem[]; currentPageId: () => number | undefined; enabled: () => boolean };
export type PageLinkOptions = { pages: () => NotebookPageItem[]; currentPageId: () => number | undefined; enabled: () => boolean };

export const PageLinkMenu = Extension.create<PageLinkOptions>({
  name: 'notebookPageLinkMenu',
  addOptions() { return { pages: () => [], currentPageId: () => undefined, enabled: () => true }; },
  addProseMirrorPlugins() {
    const editor = this.editor, options = this.options;
    const results = (state: PageLinkState) => pageMatches(options.pages(), state.query, options.currentPageId());
    return [new Plugin<PageLinkState>({
      key: pageLinkKey,
      state: {
        init: () => idle,
        apply(tr, prev, _old, next) {
          const meta = tr.getMeta(pageLinkKey) as Partial<PageLinkState> | undefined;
          let dismissed = meta?.dismissed !== undefined ? meta.dismissed : prev.dismissed !== null ? tr.mapping.map(prev.dismissed) : null;
          if (dismissed !== null && (dismissed + 2 > next.doc.content.size || next.doc.textBetween(dismissed, dismissed + 2) !== '[[')) dismissed = null;
          const { selection } = next, $from = selection.$from, parent = $from.parent;
          if (!selection.empty || !parent.isTextblock || parent.type.spec.code || !options.enabled() || !editor.isEditable) return { ...idle, dismissed };
          if ($from.marks().some(m => m.type.spec.code)) return { ...idle, dismissed };
          const before = parent.textBetween(Math.max(0, $from.parentOffset - 60), $from.parentOffset, '\0', '\0');
          const match = /\[\[([^[\]\0\n]{0,40})$/.exec(before);
          if (!match) return { ...idle, dismissed };
          const from = $from.pos - match[0].length;
          if (dismissed === from) return { ...idle, dismissed };
          const query = match[1];
          const index = meta?.index !== undefined ? meta.index : prev.active && prev.query === query ? prev.index : 0;
          const count = pageMatches(options.pages(), query, options.currentPageId()).length;
          return { active: count > 0, from, to: $from.pos, query, index: Math.max(0, Math.min(count - 1, index)), dismissed };
        },
      },
      props: {
        handleKeyDown(view, event) {
          const state = pageLinkKey.getState(view.state);
          if (!state?.active || !options.enabled() || !editor.isEditable) return false;
          const items = results(state);
          if (!items.length) return false;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            view.dispatch(view.state.tr.setMeta(pageLinkKey, { index: (state.index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length }));
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') { insertPageLink(editor, state, items[Math.min(state.index, items.length - 1)]); return true; }
          if (event.key === 'Escape') { view.dispatch(view.state.tr.setMeta(pageLinkKey, { dismissed: state.from })); return true; }
          return false;
        },
      },
    })];
  },
});
