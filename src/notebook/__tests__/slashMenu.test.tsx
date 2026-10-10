import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { SlashMenu, slashKey, slashMatches } from '../slashMenu';
import { SlashMenuPopup } from '../SlashMenuPopup';

const editors: Editor[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => e.destroy()); });
function make(content = '<p></p>') {
  const element = document.createElement('div'); document.body.append(element);
  const editor = new Editor({ element, extensions: [...notebookExtensions(false), SlashMenu], content });
  editors.push(editor); return editor;
}
const key = (editor: Editor, k: string) => editor.view.someProp('handleKeyDown', f => f(editor.view, new KeyboardEvent('keydown', { key: k })));
const type = (editor: Editor, text: string) => editor.commands.insertContent(text);
const state = (editor: Editor) => slashKey.getState(editor.state)!;

describe('slash menu', () => {
  it('opens for "/" at the start of a line, filters as you type, and picks with Enter', () => {
    const editor = make();
    type(editor, '/');
    expect(state(editor)).toMatchObject({ active: true, query: '' });
    type(editor, 'head');
    expect(slashMatches(state(editor).query).map(i => i.label)).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
    key(editor, 'ArrowDown');
    expect(state(editor).index).toBe(1);
    expect(key(editor, 'Enter')).toBe(true);
    expect(editor.getJSON().content![0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(editor.getText().trim()).toBe('');
  });

  it('stays closed mid-sentence, in code blocks, after Escape and when nothing matches', () => {
    const editor = make('<p>a</p>');
    editor.commands.focus('end'); type(editor, ' /');
    expect(state(editor).active).toBe(false);
    const code = make('<pre><code></code></pre>');
    type(code, '/');
    expect(state(code).active).toBe(false);
    const other = make();
    type(other, '/');
    key(other, 'Escape');
    expect(state(other).active).toBe(false);
    type(other, 'h');
    expect(state(other).active).toBe(false); // Still dismissed for this "/".
    const none = make();
    type(none, '/zzz');
    expect(state(none).active).toBe(false);
  });

  it('can be switched off (phone layout)', () => {
    const element = document.createElement('div'); document.body.append(element);
    const editor = new Editor({ element, extensions: [...notebookExtensions(false), SlashMenu.configure({ enabled: () => false })], content: '<p></p>' });
    editors.push(editor);
    type(editor, '/head');
    expect(state(editor).active).toBe(false);
  });

  it('keeps a dismissed "/" closed after moving away and back, and through edits above it', () => {
    const editor = make('<p>first</p><p></p>');
    editor.commands.focus('end'); type(editor, '/h');
    key(editor, 'Escape');
    editor.commands.setTextSelection(2);          // into the first line
    editor.commands.focus('end');                 // and back
    expect(state(editor).active).toBe(false);
    editor.commands.insertContentAt(1, 'more ');  // someone edits above
    editor.commands.focus('end');
    expect(state(editor).active).toBe(false);
    editor.commands.deleteRange({ from: editor.state.selection.from - 2, to: editor.state.selection.from });
    type(editor, '/h');                            // a new "/" opens again
    expect(state(editor).active).toBe(true);
  });

  it('keeps the list or quote you are already in', () => {
    for (const [html, query, kind] of [['<ul><li><p></p></li></ul>', 'bullet', 'bulletList'], ['<ol><li><p></p></li></ol>', 'numbered', 'orderedList'], ['<blockquote><p></p></blockquote>', 'quote', 'blockquote']] as const) {
      const editor = make(html);
      editor.commands.focus('end'); type(editor, `/${query}`); key(editor, 'Enter');
      expect(editor.getJSON().content![0].type).toBe(kind);
      expect(editor.getText().trim()).toBe('');
    }
  });

  it('converts the innermost list, even inside an outer list of the chosen type', () => {
    const editor = make('<ul><li><p>outer</p><ol><li><p></p></li></ol></li></ul>');
    editor.commands.focus('end'); type(editor, '/bullet'); key(editor, 'Enter');
    const outer = editor.getJSON().content![0];
    expect(outer.type).toBe('bulletList');
    expect(JSON.stringify(outer)).not.toContain('orderedList');
  });

  it('stops taking keys once it is switched off, even while open', () => {
    let on = true;
    const element = document.createElement('div'); document.body.append(element);
    const editor = new Editor({ element, extensions: [...notebookExtensions(false), SlashMenu.configure({ enabled: () => on })], content: '<p></p>' });
    editors.push(editor);
    type(editor, '/head');
    expect(state(editor).active).toBe(true);
    on = false;
    key(editor, 'Enter');
    expect(editor.getJSON().content![0].type).not.toBe('heading');
  });

  it('turns lines into lists, quotes, code, dividers and tables', () => {
    for (const [query, type_] of [['to-do', 'taskList'], ['bullet', 'bulletList'], ['numbered', 'orderedList'], ['quote', 'blockquote'], ['code', 'codeBlock'], ['divider', 'horizontalRule'], ['table', 'table']] as const) {
      const editor = make();
      type(editor, `/${query}`);
      key(editor, 'Enter');
      expect(editor.getJSON().content!.some(n => n.type === type_)).toBe(true);
    }
  });

  it('shows the list under the caret and inserts on click', () => {
    const editor = make();
    editor.view.coordsAtPos = () => ({ left: 10, right: 10, top: 10, bottom: 20 });
    render(<SlashMenuPopup editor={editor} />);
    act(() => { editor.view.dom.focus(); type(editor, '/quo'); });
    const option = screen.getByRole('option', { name: /Quote/ });
    expect(option.getAttribute('aria-selected')).toBe('true');
    // Near the bottom of the window it opens above the caret, within the window.
    editor.view.coordsAtPos = () => ({ left: 10, right: 10, top: window.innerHeight - 30, bottom: window.innerHeight - 10 });
    act(() => { window.dispatchEvent(new Event('scroll')); });
    const menu = screen.getByRole('listbox');
    expect(menu.style.top).toBe('');
    expect(menu.style.bottom).toBe('36px');
        fireEvent.mouseDown(option);
    expect(editor.getJSON().content![0].type).toBe('blockquote');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
