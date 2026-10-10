// Opening the notebook lands on a page, like a paper notebook falls open:
// the page this person had open last (per account and workspace), else the
// first page in notebook order.
import type { NotebookTree } from './types';

export const lastPageKey = (memberId?: number, teamId?: number | null) => `cp-notebook-last:${memberId}:${teamId}`;

export function readLastPage(key: string): number | null {
  try { const n = Number(localStorage.getItem(key)); return Number.isSafeInteger(n) && n > 0 ? n : null; } catch { return null; }
}
export function saveLastPage(key: string, id: number) {
  try { localStorage.setItem(key, String(id)); } catch { /* optional device preference */ }
}

/** First page in reading order: notebook, then section, then top-level page order. */
export function firstNotebookPage(tree: NotebookTree): number | null {
  const bookOrder = new Map(tree.notebooks.map(b => [b.id, b.sort]));
  const sections = [...tree.sections].sort((a, b) => (bookOrder.get(a.notebookId) ?? 0) - (bookOrder.get(b.notebookId) ?? 0) || a.sort - b.sort || a.id - b.id);
  for (const section of sections) {
    const roots = tree.pages.filter(p => p.sectionId === section.id && !p.parentId).sort((a, b) => a.sort - b.sort || a.id - b.id);
    if (roots.length) return roots[0].id;
  }
  return null;
}

/** The page to open when none is selected (or the selected one is gone). */
export function defaultNotebookPage(tree: NotebookTree, lastId: number | null): number | null {
  if (lastId && tree.pages.some(p => p.id === lastId)) return lastId;
  return firstNotebookPage(tree);
}
