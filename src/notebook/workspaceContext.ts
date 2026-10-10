// What ribbon commands need from the notebook around the open page: the
// tree, navigation, a refresh and the trash. Provided by NotebookPage.
import { createContext, useContext } from 'react';
import type { NotebookTree } from './types';

export type TagSummaryView = { scope: 'page' | 'section' | 'all'; only: string; hideDone: boolean };
export type NotebookWorkspace = {
  teamId: number | null;
  tree: NotebookTree | null;
  openPage: (id: number, blockId?: string) => void;
  refreshTree: () => void;
  openTrash: () => void;
  /** Top bar → Sticky Notes (personal scratch notes, not page content). */
  toggleStickyNotes: () => void;
  stickyNotesOpen: boolean;
  /** Home → Find Tags stays open while you jump between pages. */
  tagSummaryOpen?: boolean;
  setTagSummaryOpen?: (open: boolean) => void;
  tagSummaryView?: TagSummaryView;
  setTagSummaryView?: (view: TagSummaryView) => void;
};
export const NotebookWorkspaceContext = createContext<NotebookWorkspace | null>(null);
export const useNotebookWorkspace = () => useContext(NotebookWorkspaceContext);
