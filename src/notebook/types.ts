export interface NotebookBook { id: number; title: string; color: string | null; sort: number }
export interface NotebookSection { id: number; notebookId: number; title: string; color: string | null; sort: number; protected: boolean }
export interface NotebookPageItem { id: number; sectionId: number; parentId: number | null; title: string; sort: number; protected: boolean; ownProtected: boolean; revision: number; updatedAt: string }
export interface NotebookTree {
  notebooks: NotebookBook[]; sections: NotebookSection[]; pages: NotebookPageItem[];
  permissions: { read: boolean; edit: boolean; organize: boolean; delete: boolean; protect: boolean };
}
export interface NotebookPageData extends NotebookPageItem {
  content: unknown; canvas: unknown; createdBy: number | null; updatedBy: number | null; createdAt: string;
}
