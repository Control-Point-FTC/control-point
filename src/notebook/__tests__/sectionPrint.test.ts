import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiJson } from '../../services/api';
import { prepareNotebookPrint } from '../notebookPrint';
import { SECTION_PRINT_LIMIT, prepareSectionPrint, sectionPageOrder } from '../sectionPrint';
import type { NotebookPageItem } from '../types';

vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
vi.mock('../notebookPrint', () => ({ prepareNotebookPrint: vi.fn(async (_sync: unknown, page: { title: string }) => `<article class="notebook-sheet"><h1>${page.title}</h1></article>`) }));
afterEach(() => vi.clearAllMocks());

const item = (id: number, over: Partial<NotebookPageItem> = {}): NotebookPageItem => ({ id, sectionId: 1, parentId: null, title: `Page ${id}`, sort: id, protected: false, ownProtected: false, revision: 1, updatedAt: '2026-10-10T12:00:00Z', ...over });

describe('section print', () => {
  it('orders pages like the tree: siblings by sort, subpages right after their parent', () => {
    const pages = [item(1, { sort: 2 }), item(2, { sort: 1 }), item(3, { parentId: 1, sort: 2 }), item(4, { parentId: 1, sort: 1 }), item(5, { sectionId: 2 }), item(6, { parentId: 99 })];
    expect(sectionPageOrder(pages, 1).map(p => p.id)).toEqual([2, 1, 4, 3, 6]);
  });

  it('prints every available page after a cover and lists the ones it had to leave out', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string) => {
      if (url.endsWith('/2')) throw new ApiError(404, 'gone');
      if (url.endsWith('/4')) return { ...item(4), sectionId: 5, content: {}, canvas: {} } as any;
      return { ...item(Number(url.split('/').pop())), content: {}, canvas: {} } as any;
    });
    const progress = vi.fn();
    const result = await prepareSectionPrint({ id: 1, title: 'Build log' }, [item(1), item(2), item(3), item(4)], { memberId: 7, teamId: 3 }, new AbortController().signal, progress);
    expect(result.printed).toBe(2);
    expect(result.skipped).toEqual(['Page 2', 'Page 4']);
    expect(result.markup).toMatch(/^<header class="notebook-section-cover"><h1>Build log<\/h1><p>2 pages · printed /);
    expect(result.markup).toContain('Not included (moved, or no longer available to you): Page 2, Page 4');
    expect(result.markup.indexOf('Page 1</h1>')).toBeLessThan(result.markup.indexOf('Page 3</h1>'));
    expect(vi.mocked(apiJson).mock.calls[0][1]).toMatchObject({ headers: { 'X-CP-Notebook-Team': '3' } });
    // Attachments load through each page's own id.
    expect(vi.mocked(prepareNotebookPrint).mock.calls.map(([sync]) => (sync as any).pageId)).toEqual([1, 3]);
    expect(progress).toHaveBeenCalledWith('Preparing page 4 of 4: Page 4…');
  });

  it('stops on real failures and refuses very large sections', async () => {
    vi.mocked(apiJson).mockRejectedValue(new ApiError(500, 'Server error'));
    await expect(prepareSectionPrint({ id: 1, title: 'S' }, [item(1)], undefined, new AbortController().signal, vi.fn())).rejects.toThrow('Server error');
    const many = Array.from({ length: SECTION_PRINT_LIMIT + 1 }, (_, i) => item(i + 1));
    await expect(prepareSectionPrint({ id: 1, title: 'S' }, many, undefined, new AbortController().signal, vi.fn())).rejects.toThrow(`Print up to ${SECTION_PRINT_LIMIT}`);
    await expect(prepareSectionPrint({ id: 9, title: 'Empty' }, [item(1)], undefined, new AbortController().signal, vi.fn())).rejects.toThrow('no pages');
  });

  it('leaves out a page that lost access while its attachments loaded, but stops on other attachment failures', async () => {
    let protectedNow = false;
    vi.mocked(apiJson).mockImplementation(async (url: string) => {
      if (url.endsWith('/1') && protectedNow) throw new ApiError(404, 'gone');
      return { ...item(Number(url.split('/').pop())), content: {}, canvas: {} } as any;
    });
    vi.mocked(prepareNotebookPrint).mockImplementationOnce(async () => { protectedNow = true; throw new Error('Attachment unavailable or permission changed.'); });
    const result = await prepareSectionPrint({ id: 1, title: 'S' }, [item(1), item(2)], undefined, new AbortController().signal, vi.fn());
    expect(result.printed).toBe(1);
    expect(result.skipped).toEqual(['Page 1']);
    // Still accessible: the attachment problem is real, so the print stops.
    vi.mocked(prepareNotebookPrint).mockImplementationOnce(async () => { throw new Error('This page has too much attachment data for one export.'); });
    await expect(prepareSectionPrint({ id: 1, title: 'S' }, [item(2)], undefined, new AbortController().signal, vi.fn())).rejects.toThrow('too much attachment data');
    // The access check failing too keeps the original, more useful message.
    let calls = 0;
    vi.mocked(apiJson).mockImplementation(async () => { if (++calls > 1) throw new ApiError(500, 'Server error'); return { ...item(2), content: {}, canvas: {} } as any; });
    vi.mocked(prepareNotebookPrint).mockImplementationOnce(async () => { throw new Error('Print its PDFs separately.'); });
    await expect(prepareSectionPrint({ id: 1, title: 'S' }, [item(2)], undefined, new AbortController().signal, vi.fn())).rejects.toThrow('Print its PDFs separately.');
  });

  it('escapes titles in the cover', async () => {
    vi.mocked(apiJson).mockResolvedValue({ ...item(1), content: {}, canvas: {} } as any);
    const result = await prepareSectionPrint({ id: 1, title: '<img src=x onerror=alert(1)>' }, [item(1)], undefined, new AbortController().signal, vi.fn());
    expect(result.markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
