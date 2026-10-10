// What ribbon commands need from the notebook around the open page: the
// tree, navigation, a refresh and the trash. Provided by NotebookPage.
import { createContext, useContext } from 'react';
import type { NotebookTree } from './types';

export type NotebookWorkspace = {
  teamId: number | null;
  tree: NotebookTree | null;
  openPage: (id: number) => void;
  refreshTree: () => void;
  openTrash: () => void;
  /** Top bar → Sticky Notes (personal scratch notes, not page content). */
  toggleStickyNotes: () => void;
  stickyNotesOpen: boolean;
  /** Insert → Page templates: a new page in this section from a template. */
  openTemplates?: (sectionId: number) => void;
};
export const NotebookWorkspaceContext = createContext<NotebookWorkspace | null>(null);
export const useNotebookWorkspace = () => useContext(NotebookWorkspaceContext);
