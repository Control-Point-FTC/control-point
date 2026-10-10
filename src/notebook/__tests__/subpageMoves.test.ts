import { describe, expect, it } from 'vitest';
import { promoteMove, subpageMove } from '../treeActions';
import type { NotebookPageItem, NotebookTree } from '../types';

const page = (id: number, parentId: number | null = null, sectionId = 1): NotebookPageItem => ({ id, sectionId, parentId, title: `P${id}`, sort: id, protected: false, ownProtected: false, revision: 1, updatedAt: '' });
// Tree order: 1, 2 (children 3, 4), 5; and 6 in another section.
const tree = { notebooks: [], sections: [], permissions: { read: true, edit: true, organize: true, delete: true, protect: false },
  pages: [page(1), page(2), page(3, 2), page(4, 2), page(5), page(6, null, 2)] } as NotebookTree;

describe('make subpage / promote', () => {
  it('nests a page under the page above it, as its last subpage', () => {
    expect(subpageMove(tree, 5)).toEqual({ to: { parentId: 2 }, index: 'end' });
    expect(subpageMove(tree, 2)).toEqual({ to: { parentId: 1 }, index: 'end' });
    expect(subpageMove(tree, 4)).toEqual({ to: { parentId: 3 }, index: 'end' });
  });

  it('has nothing to nest under for the first page at its level', () => {
    expect(subpageMove(tree, 1)).toBeNull();
    expect(subpageMove(tree, 3)).toBeNull();
    expect(subpageMove(tree, 6)).toBeNull(); // other sections don't count
  });

  it('promotes a subpage to just after its former parent', () => {
    expect(promoteMove(tree, 3)).toEqual({ to: { parentId: null, afterId: 2 }, index: 0 });
    expect(promoteMove(tree, 1)).toBeNull();
  });
});
