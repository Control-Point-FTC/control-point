// The "Moved to trash" notice replaces the missing-page warnings only when
// the open page really went with what was trashed (V5 audit Low).
import { describe, expect, it } from 'vitest';
import { openPageWentWith } from '../NotebookPage';

const tree: any = {
  notebooks: [{ id: 1 }, { id: 2 }],
  sections: [{ id: 10, notebookId: 1 }, { id: 20, notebookId: 2 }],
  pages: [
    { id: 100, sectionId: 10, parentId: null },
    { id: 101, sectionId: 10, parentId: 100 },
    { id: 102, sectionId: 10, parentId: 101 },
    { id: 200, sectionId: 20, parentId: null },
  ],
  permissions: {},
};

describe('did trashing this take the open page with it?', () => {
  it('the page itself, or a page above it', () => {
    expect(openPageWentWith(tree, 'page', 102, 102)).toBe(true);
    expect(openPageWentWith(tree, 'page', 100, 102)).toBe(true);
    expect(openPageWentWith(tree, 'page', 200, 102)).toBe(false);
  });
  it('its section or notebook, not another one', () => {
    expect(openPageWentWith(tree, 'section', 10, 101)).toBe(true);
    expect(openPageWentWith(tree, 'section', 20, 101)).toBe(false);
    expect(openPageWentWith(tree, 'notebook', 1, 100)).toBe(true);
    expect(openPageWentWith(tree, 'notebook', 2, 100)).toBe(false);
  });
});
