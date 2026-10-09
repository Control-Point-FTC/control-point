import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { notebookExtensions, validatedNotebookDocument } from '../editorSchema';
import { notebookMatches, replaceNotebookMatches, notebookIndent } from '../editorActions';
import { NOTEBOOK_TEMPLATES, notebookTemplate } from '../templates';
describe('real notebook editing actions', () => {
  it('finds literal text across marked spans with correct Unicode editor positions', () => {
    const editor = new Editor({ extensions: notebookExtensions(), content: '<p>İ <strong>Drive</strong> train.* Drive train.*</p>' });
    try {
      const matches = notebookMatches(editor, 'Drive train.*'); expect(matches).toHaveLength(2);
      expect(matches.map(m => editor.state.doc.textBetween(m.from, m.to))).toEqual(['Drive train.*', 'Drive train.*']);
      expect(notebookMatches(editor, 'drive', true)).toHaveLength(0);
      expect(notebookMatches(editor, '*')).toHaveLength(2);
    } finally { editor.destroy(); }
  });
  it('replaces all in one undoable transaction and prevents read-only replacement', () => {
    const editor = new Editor({ extensions: notebookExtensions(), content: '<p>Drive test. Drive again.</p>' });
    try {
      replaceNotebookMatches(editor, notebookMatches(editor, 'Drive'), 'Lift');
      expect(editor.getText()).toBe('Lift test. Lift again.');
      editor.commands.undo(); expect(editor.getText()).toBe('Drive test. Drive again.');
      editor.setEditable(false);
      expect(replaceNotebookMatches(editor, notebookMatches(editor, 'Drive'), 'Blocked')).toBe(false);
      expect(editor.getText()).toBe('Drive test. Drive again.');
    } finally { editor.destroy(); }
  });
  it('bounds paragraph indentation and persists it through serialization', () => {
    const editor = new Editor({ extensions: notebookExtensions(), content: '<p>Team</p>' });
    try {
      editor.commands.setTextSelection(1);
      for (let i = 0; i < 10; i++) notebookIndent(editor, 1);
      expect(editor.getJSON().content?.[0].attrs?.indent).toBe(6);
      notebookIndent(editor, -1); expect(editor.getJSON().content?.[0].attrs?.indent).toBe(5);
      editor.commands.setContent(editor.getJSON()); expect(editor.getHTML()).toContain('data-nb-indent="5"');
    } finally { editor.destroy(); }
  });
  it('creates independent editable instances of every template with supported blocks', () => {
    for (const template of NOTEBOOK_TEMPLATES) {
      const value = notebookTemplate(template.id);
      expect(() => validatedNotebookDocument(value)).not.toThrow();
      const editor = new Editor({ extensions: notebookExtensions(), content: value });
      try {
        const saved = editor.getJSON(); editor.commands.setContent(saved); expect(editor.getJSON()).toEqual(saved);
        value.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'Changed instance' }] });
        expect(JSON.stringify(notebookTemplate(template.id))).not.toContain('Changed instance');
      } finally { editor.destroy(); }
    }
  });
});
