import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { BlockMoves, blockIndexAt, deleteBlock, duplicateBlock, moveBlock, runBlock } from '../blockMoves';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(e => e.destroy()));
const make = (html = '<p>one</p><h2>two</h2><ul><li><p>three</p></li></ul>') => { const e = new Editor({ extensions: [...notebookExtensions(false), BlockMoves], content: html }); editors.push(e); return e; };
// The editor keeps a trailing empty paragraph to type into.
const texts = (e: Editor) => e.state.doc.content.content.map(n => n.textContent).filter(Boolean);
const key = (e: Editor, k: string) => e.view.someProp('handleKeyDown', f => f(e.view, new KeyboardEvent('keydown', { key: k, altKey: true, shiftKey: true })));

describe('block moves', () => {
  it('moves blocks up and down and keeps the cursor in the moved block', () => {
    const e = make();
    e.commands.setTextSelection(2); // in "one"
    runBlock(e, s => moveBlock(s, 0, 1));
    expect(texts(e)).toEqual(['two', 'one', 'three']);
    expect(e.state.selection.$from.parent.textContent).toBe('one');
    runBlock(e, s => moveBlock(s, 2, -1));
    expect(texts(e)).toEqual(['two', 'three', 'one']);
    expect(moveBlock(e.state, 0, -1)).toBeNull();
    expect(moveBlock(e.state, e.state.doc.childCount - 1, 1)).toBeNull();
  });

  it('duplicates and deletes, never leaving an empty page', () => {
    const e = make('<p>only</p>');
    runBlock(e, s => duplicateBlock(s, 0));
    expect(texts(e)).toEqual(['only', 'only']);
    while (e.state.doc.childCount > 1) runBlock(e, st => deleteBlock(st, 0));
    runBlock(e, st => deleteBlock(st, 0));
    expect(e.state.doc.childCount).toBe(1);
    expect(e.state.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('Alt+Shift+arrows move the block the cursor is in; read-only pages are left alone', () => {
    const e = make();
    let at = 0; e.state.doc.descendants((n, p) => { if (n.isTextblock && n.textContent === 'three') at = p + 2; }); e.commands.setTextSelection(at);
    expect(blockIndexAt(e.state, e.state.selection.from)).toBe(2);
    key(e, 'ArrowUp');
    expect(texts(e)).toEqual(['one', 'three', 'two']);
    e.setEditable(false);
    expect(runBlock(e, s => moveBlock(s, 0, 1))).toBe(false);
  });
});
