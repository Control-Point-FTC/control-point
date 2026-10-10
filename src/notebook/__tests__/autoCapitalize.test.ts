import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { AUTO_CAPITALIZE_KEY, AutoCapitalize, setAutoCapitalize } from '../autoCapitalize';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(e => e.destroy()); localStorage.removeItem(AUTO_CAPITALIZE_KEY); });
function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', f => f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}
function make(content = '<p></p>') {
  const editor = new Editor({ extensions: [...notebookExtensions(false), AutoCapitalize], content });
  editors.push(editor); return editor;
}

describe('auto-capitalize', () => {
  it('capitalizes the first letter of a new line only', () => {
    const editor = make();
    type(editor, 'hello there');
    expect(editor.getText()).toBe('Hello there');
    editor.commands.enter(); type(editor, 'next');
    expect(editor.getText()).toContain('Next');
    // A word at once (autocorrect, phone keyboards) gets the same treatment.
    editor.commands.enter();
    const { from } = editor.state.selection;
    editor.view.someProp('handleTextInput', f => f(editor.view, from, from, 'word', () => editor.state.tr));
    expect(editor.getText()).toContain('Word');
  });
  it('lets Backspace put the lowercase letter back', () => {
    const editor = make();
    type(editor, 'i');
    expect(editor.getText()).toBe('I');
    const backspace = () => editor.view.someProp('handleKeyDown', f => f(editor.view, new KeyboardEvent('keydown', { key: 'Backspace' })));
    expect(backspace()).toBe(true);
    expect(editor.getText()).toBe('i');
    // Only right after: later Backspaces delete normally.
    type(editor, 'f');
    expect(backspace()).toBeFalsy();
  });
  it('leaves code blocks alone and can be turned off on this device', () => {
    const code = make('<pre><code></code></pre>');
    type(code, 'npm');
    expect(code.getText().trim()).toBe('npm');
    setAutoCapitalize(false);
    const plain = make();
    type(plain, 'lower');
    expect(plain.getText()).toBe('lower');
  });
});
