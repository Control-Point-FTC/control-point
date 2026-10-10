// Page links show their state: a link to a page that's gone (deleted, in
// trash, or not visible to you) is marked unavailable; a link to an
// admin-only page is marked as such. Only the reader's own visible tree is
// used, so nothing about hidden pages is revealed.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { normalizeNotebookLink, parseNotebookPageLink } from './pageLinks';
import type { NotebookPageItem } from './types';

export const linkStatesKey = new PluginKey<DecorationSet>('notebookLinkStates');
export type LinkState = 'ok' | 'missing' | 'locked';

export function pageLinkState(href: unknown, pages: NotebookPageItem[], origin = typeof window === 'undefined' ? 'https://control-point.invalid' : window.location.origin): LinkState | null {
  // Only links on this site are notebook links; another site's /notebook URL is just a website.
  const link = typeof href === 'string' ? parseNotebookPageLink(normalizeNotebookLink(href, origin)) : null;
  if (!link) return null;
  const page = pages.find(p => p.id === link.pageId);
  return !page ? 'missing' : page.protected ? 'locked' : 'ok';
}

const NOTE: Record<'missing' | 'locked', { text: string; title: string }> = {
  missing: { text: ' (unavailable)', title: 'This page isn’t available: it was deleted, moved to trash, or you can’t open it.' },
  locked: { text: ' · admin only', title: 'Admin-only page' },
};

function decorate(state: EditorState, pages: NotebookPageItem[]) {
  const decorations: Decoration[] = [];
  // A link can span several text runs (bold part, italic part): style each
  // run, but put the note once, after the whole link.
  let run: { href: string; status: 'missing' | 'locked'; end: number } | null = null;
  const close = () => {
    if (!run) return;
    const { status, end } = run;
    decorations.push(Decoration.widget(end, () => { const note = document.createElement('span'); note.className = `nb-link-note nb-link-note-${status}`; note.textContent = NOTE[status].text; return note; }, { side: -1, key: `${status}:${end}` }));
    run = null;
  };
  state.doc.descendants((node, pos) => {
    if (!node.isText) { if (node.isBlock) close(); return; }
    const link = node.marks.find(m => m.type.name === 'link');
    const status = link ? pageLinkState(link.attrs.href, pages) : null;
    if (!link || (status !== 'missing' && status !== 'locked')) { close(); return; }
    if (run && (run.href !== link.attrs.href || run.end !== pos)) close();
    decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: `nb-link-${status}`, title: NOTE[status].title }));
    run = { href: link.attrs.href, status, end: pos + node.nodeSize };
  });
  close();
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
