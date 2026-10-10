// Page links show their state: a link to a page that's gone (deleted, in
// trash, or not visible to you) is marked unavailable; a link to an
// admin-only page is marked as such. Only the reader's own visible tree is
// used, so nothing about hidden pages is revealed.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { parseNotebookPageLink } from './pageLinks';
import type { NotebookPageItem } from './types';

export const linkStatesKey = new PluginKey<DecorationSet>('notebookLinkStates');
export type LinkState = 'ok' | 'missing' | 'locked';

export function pageLinkState(href: unknown, pages: NotebookPageItem[]): LinkState | null {
  const link = parseNotebookPageLink(typeof href === 'string' ? href.replace(/^https?:\/\/[^/]+/, '') : href);
  if (!link) return null;
  const page = pages.find(p => p.id === link.pageId);
  return !page ? 'missing' : page.protected ? 'locked' : 'ok';
}

function decorate(state: EditorState, pages: NotebookPageItem[]) {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const link = node.marks.find(m => m.type.name === 'link');
    const status = link && pageLinkState(link.attrs.href, pages);
    if (status === 'missing') decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'nb-link-missing', title: 'This page isn’t available: it was deleted, moved to trash, or you can’t open it.' }));
    if (status === 'locked') decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'nb-link-locked', title: 'Admin-only page' }));
  });
  return DecorationSet.create(state.doc, decorations);
}

/** Dispatch this meta after the page list changes to refresh the marks. */
export const LINK_STATES_REFRESH = 'refresh';

export const LinkStates = Extension.create<{ pages: () => NotebookPageItem[] }>({
  name: 'notebookLinkStates',
  addOptions() { return { pages: () => [] }; },
  addProseMirrorPlugins() {
    const pages = () => this.options.pages();
    return [new Plugin<DecorationSet>({
      key: linkStatesKey,
      state: {
        init: (_, state) => decorate(state, pages()),
        apply: (tr, old, _prev, next) => tr.docChanged || tr.getMeta(linkStatesKey) === LINK_STATES_REFRESH ? decorate(next, pages()) : old.map(tr.mapping, tr.doc),
      },
      props: { decorations: state => linkStatesKey.getState(state) },
    })];
  },
});
