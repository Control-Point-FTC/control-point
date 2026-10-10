// What Bruno may know about the notebook screen: the active pane's page id
// (never for a protected page) and the ids of the selected blocks. Page text
// never travels from here; the server re-reads it under Bruno's access.
import { useEffect } from 'react';
import type { EditorState } from '@tiptap/pm/state';
import { getScreenEntity, setScreenEntity } from '../services/brunoContext';

const MAX_BLOCKS = 20;

/** Ids of the innermost blocks the selection overlaps: text blocks (a table
 *  cell's paragraph, not the table) and atomic blocks such as attachments. */
export function selectedNotebookBlocks(state: EditorState): string[] | null {
  const { selection, doc } = state;
  if (selection.empty) return null;
  const ids: string[] = [];
  doc.nodesBetween(selection.from, selection.to, node => {
    if (ids.length >= MAX_BLOCKS) return false;
    if (node.isTextblock || (node.isBlock && node.isAtom)) { if (typeof node.attrs?.id === 'string') ids.push(node.attrs.id); return false; }
    return true;
  });
  return ids.length ? ids : null;
}

// Each mounted editor tells us how to read its current selection, so a pane
// switch can report the new pane's selection without waiting for a click.
const selections = new Map<number, () => string[] | null>();
export function registerNotebookSelection(pageId: number, read: () => string[] | null): () => void {
  selections.set(pageId, read);
  return () => { if (selections.get(pageId) === read) selections.delete(pageId); };
}

/** Report the active pane's page and its current selection; clear both when
 *  the page is protected, changes, or the notebook unmounts. */
export function useBrunoNotebookPage(pageId: number | null, isProtected: boolean) {
  useEffect(() => {
    const id = pageId && !isProtected ? pageId : null;
    setScreenEntity('notebookPageId', id);
    setScreenEntity('notebookBlockIds', id ? selections.get(id)?.() ?? null : null);
    return () => { if (getScreenEntity('notebookPageId') === id) { setScreenEntity('notebookPageId', null); setScreenEntity('notebookBlockIds', null); } };
  }, [pageId, isProtected]);
}
