// What Bruno may know about the notebook screen: the active pane's page id
// (never for a protected page) and the ids of the selected blocks. Page text
// never travels from here; the server re-reads it under Bruno's access.
import { useEffect } from 'react';
import type { EditorState } from '@tiptap/pm/state';
import { getScreenEntity, setScreenEntity } from '../services/brunoContext';

const MAX_BLOCKS = 20;

/** Ids of the innermost text blocks the selection overlaps. */
export function selectedNotebookBlocks(state: EditorState): string[] | null {
  const { selection, doc } = state;
  if (selection.empty) return null;
  const ids: string[] = [];
  doc.nodesBetween(selection.from, selection.to, node => {
    if (ids.length >= MAX_BLOCKS) return false;
    if (node.isTextblock) { if (typeof node.attrs?.id === 'string') ids.push(node.attrs.id); return false; }
    return true;
  });
  return ids.length ? ids : null;
}

/** Report the active pane's page; clear it when the page is protected,
 *  changes, or the notebook unmounts. */
export function useBrunoNotebookPage(pageId: number | null, isProtected: boolean) {
  useEffect(() => {
    const id = pageId && !isProtected ? pageId : null;
    if (getScreenEntity('notebookPageId') !== id) setScreenEntity('notebookBlockIds', null);
    setScreenEntity('notebookPageId', id);
    return () => { if (getScreenEntity('notebookPageId') === id) { setScreenEntity('notebookPageId', null); setScreenEntity('notebookBlockIds', null); } };
  }, [pageId, isProtected]);
}
