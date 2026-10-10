import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { LINK_STATES_REFRESH, LinkStates, linkStatesKey, pageLinkState } from '../linkStates';
import type { NotebookPageItem } from '../types';

const page = (id: number, isProtected = false): NotebookPageItem => ({ id, sectionId: 1, parentId: null, title: `P${id}`, sort: id, protected: isProtected, ownProtected: isProtected, revision: 1, updatedAt: '' });
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(e => e.destroy()));

describe('page link states', () => {
  it('classifies links by the visible tree only', () => {
    const pages = [page(1), page(2, true)];
    expect(pageLinkState('/notebook/p/1', pages)).toBe('ok');
    expect(pageLinkState('/notebook?page=2', pages)).toBe('locked');
    expect(pageLinkState('/notebook/p/9', pages)).toBe('missing');
    expect(pageLinkState('https://cp.test/notebook/p/9', pages, 'https://cp.test')).toBe('missing');
    expect(pageLinkState('https://other.example/notebook/p/9', pages, 'https://cp.test')).toBeNull(); // another site
    expect(pageLinkState('https://example.com', pages)).toBeNull();
  });

  it('marks unavailable and admin-only links, and refreshes when pages change', () => {
    let pages = [page(1), page(2, true)];
    const element = document.createElement('div'); document.body.append(element);
    const editor = new Editor({ element, extensions: [...notebookExtensions(false), LinkStates.configure({ pages: () => pages })],
      content: '<p><a href="/notebook/p/1">ok</a> <a href="/notebook/p/2">admin</a> <a href="/notebook/p/9">gone</a></p>' });
    editors.push(editor);
    expect(element.querySelectorAll('.nb-link-missing')).toHaveLength(1);
    expect(element.querySelectorAll('.nb-link-locked')).toHaveLength(1);
    pages = [page(2, true)]; // page 1 was deleted
    editor.view.dispatch(editor.state.tr.setMeta(linkStatesKey, LINK_STATES_REFRESH));
    expect(element.querySelectorAll('.nb-link-missing')).toHaveLength(2);
  });

  it('notes a mixed-format link once, after the whole link', () => {
    const element = document.createElement('div'); document.body.append(element);
    const editor = new Editor({ element, extensions: [...notebookExtensions(false), LinkStates.configure({ pages: () => [] })],
      content: '<p><a href="/notebook/p/9">old <strong>page</strong></a> and more</p>' });
    editors.push(editor);
    expect(element.querySelectorAll('.nb-link-missing')).toHaveLength(2);
    const notes = element.querySelectorAll('.nb-link-note');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(' (unavailable)');
    expect(editor.getText()).toBe('old page and more'); // the note isn't part of the text
  });
});
