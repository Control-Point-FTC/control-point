import { describe, expect, it } from 'vitest';
import { notebookDrop, notebookSiblings } from '../treeActions';
import type { NotebookTree } from '../types';
const tree = { notebooks: [{ id: 1 }, { id: 2 }], sections: [{ id: 1, notebookId: 1 }, { id: 2, notebookId: 2 }], pages: [{ id: 10, sectionId: 1, parentId: null }, { id: 11, sectionId: 1, parentId: 10 }, { id: 12, sectionId: 1, parentId: null }, { id: 13, sectionId: 2, parentId: null }] } as NotebookTree;
describe('notebook hierarchy drag destinations', () => {
  it('adjusts reorder positions after removing the dragged sibling', () => {
    expect(notebookSiblings(tree, { kind: 'page', id: 10 })).toEqual([10,12]);
    expect(notebookDrop(tree, { kind: 'page', id: 10 }, { kind: 'page', id: 12 }, 'after')).toEqual({ to: { sectionId: 1, parentId: null }, index: 1 });
  });
  it('nests pages, appends to sections and moves sections across notebooks', () => {
    expect(notebookDrop(tree, { kind: 'page', id: 13 }, { kind: 'page', id: 10 }, 'inside')).toEqual({ to: { sectionId: 1, parentId: 10 }, index: 1 });
    expect(notebookDrop(tree, { kind: 'page', id: 10 }, { kind: 'section', id: 2 }, 'inside')).toEqual({ to: { sectionId: 2, parentId: null }, index: 1 });
    expect(notebookDrop(tree, { kind: 'section', id: 1 }, { kind: 'notebook', id: 2 }, 'inside')).toEqual({ to: { notebookId: 2 }, index: 1 });
  });
  it('rejects self/descendant and invalid type destinations before posting', () => {
    expect(() => notebookDrop(tree, { kind: 'page', id: 10 }, { kind: 'page', id: 11 }, 'inside')).toThrow('descendants');
    expect(() => notebookDrop(tree, { kind: 'page', id: 10 }, { kind: 'page', id: 10 }, 'before')).toThrow();
    expect(() => notebookDrop(tree, { kind: 'notebook', id: 1 }, { kind: 'page', id: 12 }, 'after')).toThrow();
  });
});
