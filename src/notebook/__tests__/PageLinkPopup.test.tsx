import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { PageLinkMenu } from '../pageLinkMenu';
import { PageLinkPopup } from '../PageLinkPopup';
import type { NotebookPageItem } from '../types';

const PAGES: NotebookPageItem[] = [{ id: 5, sectionId: 1, parentId: null, title: 'Drivetrain', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: '' }];
const editors: Editor[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => e.destroy()); });
function make() {
  const element = document.createElement('div'); document.body.append(element);
  const editor = new Editor({ element, extensions: [...notebookExtensions(false), PageLinkMenu.configure({ pages: () => PAGES, currentPageId: () => 1, enabled: () => true })], content: '<p></p>' });
  editor.view.coordsAtPos = () => ({ left: 10, right: 10, top: 10, bottom: 20 });
  editors.push(editor); return editor;
}

describe('page link list', () => {
  it('shows an unfinished [[ query as soon as it switches to that editor', () => {
    const first = make(), second = make();
    second.view.dom.focus(); second.commands.insertContent('[[dri');
    const view = render(<PageLinkPopup editor={first} pages={PAGES} currentPageId={1} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    // Focus already moved to the canvas text box before the popup switched to it.
    view.rerender(<PageLinkPopup editor={second} pages={PAGES} currentPageId={1} />);
    expect(screen.getByRole('option', { name: /Drivetrain/ })).toBeTruthy();
  });

  it('scrolls the highlighted page into view', () => {
    const editor = make();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    editor.view.dom.focus(); editor.commands.insertContent('[[dri');
    render(<PageLinkPopup editor={editor} pages={PAGES} currentPageId={1} />);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
