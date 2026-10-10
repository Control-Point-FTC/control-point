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
    fireEvent.mouseDown(option);
    expect(editor.getJSON().content![0].type).toBe('blockquote');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
