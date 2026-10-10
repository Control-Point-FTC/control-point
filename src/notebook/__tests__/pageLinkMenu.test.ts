import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { PageLinkMenu, pageLinkKey, pageMatches } from '../pageLinkMenu';
import type { NotebookPageItem } from '../types';

const page = (id: number, title: string): NotebookPageItem => ({ id, sectionId: 1, parentId: null, title, sort: id, protected: false, ownProtected: false, revision: 1, updatedAt: '' });
const PAGES = [page(1, 'Drivetrain'), page(2, 'Intake design'), page(3, 'Drive practice log'), page(4, 'Current page')];
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(e => e.destroy()));
function make(content = '<p></p>', enabled = true) {
  const element = document.createElement('div'); document.body.append(element);
  const editor = new Editor({ element, extensions: [...notebookExtensions(false), PageLinkMenu.configure({ pages: () => PAGES, currentPageId: () => 4, enabled: () => enabled })], content });
  editors.push(editor); editor.commands.focus('end'); return editor;
}
const key = (editor: Editor, k: string) => editor.view.someProp('handleKeyDown', f => f(editor.view, new KeyboardEvent('keydown', { key: k })));
const state = (editor: Editor) => pageLinkKey.getState(editor.state)!;

describe('[[ page links', () => {
  it('matches titles, puts prefix matches first, and leaves out the current page', () => {
    expect(pageMatches(PAGES, 'drive', 4).map(p => p.title)).toEqual(['Drive practice log', 'Drivetrain']);
    expect(pageMatches(PAGES, 'design', 4).map(p => p.title)).toEqual(['Intake design']);
    expect(pageMatches(PAGES, '', 4).map(p => p.id)).not.toContain(4);
  });

  it('opens mid-sentence, filters, and inserts a working page link', () => {
    const editor = make();
    editor.commands.insertContent({ type: 'text', text: 'See [[intake' });
    expect(state(editor)).toMatchObject({ active: true, query: 'intake' });
    expect(key(editor, 'Enter')).toBe(true);
    const json = JSON.stringify(editor.getJSON());
    expect(editor.getText()).toBe('See Intake design ');
    expect(json).toContain('"type":"link"');
    expect(json).toMatch(/notebook[^"]*2/);
    expect(state(editor).active).toBe(false);
  });

  it('stays closed in code, after Escape, with no match, or when switched off', () => {
    const code = make('<pre><code></code></pre>');
    code.commands.insertContent('[[dri');
    expect(state(code).active).toBe(false);
    const esc = make();
    esc.commands.insertContent('[[dri');
    key(esc, 'Escape');
    esc.commands.insertContent('v');
    expect(state(esc).active).toBe(false);
    const none = make();
    none.commands.insertContent('[[zzz');
    expect(state(none).active).toBe(false);
    const off = make('<p></p>', false);
    off.commands.insertContent('[[dri');
    expect(state(off).active).toBe(false);
  });
});
