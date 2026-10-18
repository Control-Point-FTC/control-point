// What ribbon commands need from the notebook around the open page: the
// tree, navigation, a refresh and the trash. Provided by NotebookPage.
import { createContext, useContext } from 'react';
import type { NotebookTree } from './types';

export type TagSummaryView = { scope: 'page' | 'section' | 'all'; only: string; hideDone: boolean };
/** View → Navigation: the explorer pane, or sections as tabs across the top. */
export type NavigationLayout = 'panes' | 'tabs';
export type NotebookWorkspace = {
  teamId: number | null;
  /** The signed-in member (personal preferences such as toolbar density). */
  memberId?: number | null;
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
  /** Insert → Page templates: a new page in this section from a template. */
  openTemplates?: (sectionId: number) => void;
  /** The section a new page goes into (the open page's, else the active one). */
  currentSection?: number | null;
  navigationLayout?: NavigationLayout;
  setNavigationLayout?: (layout: NavigationLayout) => void;
  /** Page bar → More page actions: less frequent notebook actions (quick note, export). */
  pageActions?: { label: string; onSelect: () => void; disabled?: boolean }[];
};
export const NotebookWorkspaceContext = createContext<NotebookWorkspace | null>(null);
export const useNotebookWorkspace = () => useContext(NotebookWorkspaceContext);
