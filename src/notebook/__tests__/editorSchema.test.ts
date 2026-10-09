import { Editor, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { NOTEBOOK_FONTS, notebookExtensions, validatedNotebookDocument } from '../editorSchema';
import { notebookPageReferences } from '../pageLinks';

describe('real notebook editor schema', () => {
  it('normalizes pasted same-site notebook links so copied URLs produce backlinks', () => {
    const editor = new Editor({ extensions: notebookExtensions(), content: '<p>Link here</p>' });
    try { editor.commands.selectAll(); editor.commands.setLink({ href: `${window.location.origin}/notebook/p/42?block=block-1` }); expect(notebookPageReferences(editor.getJSON())).toEqual([{pageId:42,blockId:'block-1'}]); editor.commands.setLink({href:'https://another-site.test/notebook/p/42'}); expect(notebookPageReferences(editor.getJSON())).toEqual([]); } finally { editor.destroy(); }
  });
  it('persists every font choice with formatting through serialize and reload', () => {
    for (const font of NOTEBOOK_FONTS) {
      const editor = new Editor({ extensions: notebookExtensions(), content: '<p>Robotics notes</p>' });
      try {
        editor.commands.selectAll();
        editor.chain().setFontFamily(font.value).setFontSize('24px').setBold().setItalic().setUnderline().setStrike().setColor('#3b82f6').setBackgroundColor('#eab308').run();
        const json = editor.getJSON();
        expect(() => validatedNotebookDocument(json)).not.toThrow();
        editor.commands.setContent(json);
        expect(editor.getHTML()).toContain(`font-family: ${font.value.replaceAll('"', '&quot;')}`);
        expect(editor.getHTML()).toContain('font-size: 24px');
        expect(editor.getHTML()).toContain('<strong>');
        expect(editor.getHTML()).toContain('<em>');
        expect(editor.getHTML()).toContain('<u>');
        expect(editor.getHTML()).toContain('<s>');
        expect(editor.getJSON().content?.[0].attrs?.id).toBeTruthy();
      } finally { editor.destroy(); }
    }
  });
  it('supports real tables, shading and block tags, with stable IDs', () => {
    const editor = new Editor({ extensions: notebookExtensions(), content: '<p>Planning</p>' });
    try {
      editor.commands.setTextSelection(1);
      editor.commands.updateAttributes('paragraph', { nbTag: 'important' });
      editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
      editor.commands.setCellAttribute('backgroundColor', '#eab308');
      const before = editor.getJSON();
      expect(() => validatedNotebookDocument(before)).not.toThrow();
      editor.commands.setContent(before);
      expect(editor.getHTML()).toContain('background-color:');
      const persisted: JSONContent = editor.getJSON();
      expect(persisted.content?.find(n => n.type === 'table')?.content?.[0].content?.[0].attrs?.backgroundColor).toBe('#eab308');
      expect(editor.getHTML()).toContain('data-nb-tag="important"');
      expect(editor.getJSON()).toEqual(before);
    } finally { editor.destroy(); }
  });
  it('rejects unknown documents, fields, blocks and attributes without modifying the input', () => {
    for (const value of [
      [{ type: 'legacy-block', text: 'Keep me' }],
      { type: 'doc', content: [{ type: 'futureBlock', content: [] }] },
      { type: 'doc', futureFormat: 'Keep me', content: [{ type: 'paragraph' }] },
      { type: 'doc', content: [{ type: 'paragraph', attrs: { futureAttribute: 'Keep me' } }] },
    ]) {
      const original = JSON.stringify(value);
      expect(() => validatedNotebookDocument(value)).toThrow();
      expect(JSON.stringify(value)).toBe(original);
    }
  });
  it('sanitizes styles and unsafe links from stored JSON', () => {
    const editor = new Editor({ extensions: notebookExtensions(), content: {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes', marks: [
        { type: 'textStyle', attrs: { fontFamily: 'evil; background-image:url(https://outside.test)', fontSize: '12px; background:red', color: 'red; background:url(https://outside.test)' } },
        { type: 'link', attrs: { href: 'javascript:alert(1)' } },
      ] }] }],
    } });
    try {
      expect(editor.getHTML()).not.toContain('outside.test');
      expect(editor.getHTML()).not.toContain('javascript:');
      expect(editor.getText()).toBe('Notes');
    } finally { editor.destroy(); }
  });
});
