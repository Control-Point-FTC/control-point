import { describe, it, expect, beforeEach } from 'vitest';
import { clearScreenContext, getScreenContext, setScreenEntity, setScreenRoute } from '../brunoContext';

describe('Bruno screen context on the notebook', () => {
  beforeEach(() => clearScreenContext());

  it('sends only the open page id and selected block ids, never other entities', () => {
    setScreenRoute('/notebook', 'Notebook');
    setScreenEntity('taskId', 4);
    expect(getScreenContext()).toEqual({ route: '/notebook', view: 'Team notebook' });
    setScreenEntity('notebookPageId', 12);
    setScreenEntity('notebookBlockIds', ['a', 'b']);
    expect(getScreenContext()).toEqual({ route: '/notebook', view: 'Team notebook', notebookPageId: 12, notebookBlockIds: ['a', 'b'] });
  });

  it('drops block ids without a page, and clears with the page', () => {
    setScreenRoute('/notebook', 'Notebook');
    setScreenEntity('notebookBlockIds', ['a']);
    expect(getScreenContext()).toEqual({ route: '/notebook', view: 'Team notebook' });
    setScreenEntity('notebookPageId', 3);
    setScreenEntity('notebookPageId', null);
    expect(getScreenContext()).toEqual({ route: '/notebook', view: 'Team notebook' });
  });
});
