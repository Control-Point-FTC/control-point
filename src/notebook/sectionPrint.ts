// File → Print section: every page you can open in the current section, in
// tree order (each page followed by its subpages), one after another with a
// page break between them and a short cover. Pages are printed from their
// saved versions; their text flows naturally (no on-screen layout to copy)
// and drawings keep their page coordinates.
import { ApiError, apiJson } from '../services/api';
import { prepareNotebookPrint } from './notebookPrint';
import type { NotebookSync } from './NotebookSync';
import type { NotebookPageData, NotebookPageItem } from './types';

export const SECTION_PRINT_LIMIT = 60;

/** Pages of a section in tree order: siblings by sort, children after their parent. */
export function sectionPageOrder(pages: NotebookPageItem[], sectionId: number): NotebookPageItem[] {
  const inSection = pages.filter(p => p.sectionId === sectionId);
  const ids = new Set(inSection.map(p => p.id));
  const children = new Map<number | null, NotebookPageItem[]>();
  for (const page of inSection) {
    // A page whose parent isn't listed (e.g. hidden) is printed at the top level.
    const parent = page.parentId !== null && ids.has(page.parentId) ? page.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), page]);
  }
  const ordered: NotebookPageItem[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null) => {
    for (const page of (children.get(parent) ?? []).sort((a, b) => a.sort - b.sort || a.id - b.id)) {
      if (seen.has(page.id)) continue;
      seen.add(page.id); ordered.push(page); walk(page.id);
    }
  };
  walk(null);
  return ordered;
}

export type SectionPrint = { markup: string; printed: number; skipped: string[] };

export async function prepareSectionPrint(
  section: { id: number; title: string },
  pages: NotebookPageItem[],
  scope: NotebookSync['scope'],
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<SectionPrint> {
  const ordered = sectionPageOrder(pages, section.id);
  if (!ordered.length) throw new Error('This section has no pages to print.');
  if (ordered.length > SECTION_PRINT_LIMIT) throw new Error(`This section has ${ordered.length} pages. Print up to ${SECTION_PRINT_LIMIT} at a time by moving some into another section, or print pages one by one.`);
  const headers = scope ? { 'X-CP-Notebook-Team': String(scope.teamId) } : undefined;
  const sheets: string[] = [], skipped: string[] = [];
  for (const [index, item] of ordered.entries()) {
    signal.throwIfAborted();
    onProgress(`Preparing page ${index + 1} of ${ordered.length}: ${item.title || 'Untitled'}…`);
    let page: NotebookPageData;
    try { page = await apiJson<NotebookPageData>(`/api/notebook/pages/${item.id}`, { headers, cache: 'no-store', signal }); }
    catch (e) {
      // Protected, moved or deleted since the list loaded: leave it out and say so.
      if (!signal.aborted && e instanceof ApiError && (e.status === 403 || e.status === 404)) { skipped.push(item.title || 'Untitled'); continue; }
      throw e;
    }
    // Attachments load through the page they belong to.
    const pageSync = { pageId: item.id, scope } as NotebookSync;
    sheets.push(await prepareNotebookPrint(pageSync, page, signal, message => onProgress(`Page ${index + 1} of ${ordered.length}: ${message}`)));
  }
  if (!sheets.length) throw new Error('None of the pages in this section could be opened. Access may have changed.');
  const cover = document.createElement('header');
  cover.className = 'notebook-section-cover';
  const title = document.createElement('h1'); title.textContent = section.title || 'Section';
  const meta = document.createElement('p');
  meta.textContent = `${sheets.length} ${sheets.length === 1 ? 'page' : 'pages'} · printed ${new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
  cover.append(title, meta);
  if (skipped.length) {
    const note = document.createElement('p');
    note.textContent = `Not included (no longer available to you): ${skipped.join(', ')}`;
    cover.append(note);
  }
  return { markup: cover.outerHTML + sheets.join(''), printed: sheets.length, skipped };
}
