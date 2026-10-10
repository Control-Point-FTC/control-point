import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { BLOCK_MENU_EVENT, BlockMoves, blockIndexAt, currentBlockIndex, deleteBlock, duplicateBlock, moveBlock, runBlock } from '../blockMoves';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';

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

  it('finds the target block by id after collaborators insert above it', () => {
    const e = new Editor({ extensions: notebookExtensions(false), content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'a' }, content: [{ type: 'text', text: 'one' }] }, { type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'two' }] }] } });
    editors.push(e);
    const id = 'b';
    expect(currentBlockIndex(e.state, { index: 1, id })).toBe(1);
    e.commands.insertContentAt(0, '<p>new above</p>');
    expect(currentBlockIndex(e.state, { index: 1, id })).toBe(2);
    expect(currentBlockIndex(e.state, { index: 1, id: 'gone' })).toBe(-1);
  });

  it('keeps each block move its own undo step in a shared page', () => {
    const element = document.createElement('div'); document.body.append(element);
    const e = new Editor({ element, extensions: [...notebookExtensions(true), BlockMoves, Collaboration.configure({ document: new Y.Doc() })] });
    editors.push(e);
    e.commands.setContent('<p>one</p><p>two</p><p>three</p>');
    runBlock(e, s => moveBlock(s, 0, 1));
    runBlock(e, s => moveBlock(s, 1, 1));
    expect(texts(e)).toEqual(['two', 'three', 'one']);
    e.commands.undo();
    expect(texts(e)).toEqual(['two', 'one', 'three']);
  });

  it('Alt+Shift+O asks for the block menu', () => {
    const e = make();
    const heard = vi.fn();
    e.view.dom.addEventListener(BLOCK_MENU_EVENT, heard);
    e.view.someProp('handleKeyDown', f => f(e.view, new KeyboardEvent('keydown', { key: 'o', altKey: true, shiftKey: true })));
    expect(heard).toHaveBeenCalledOnce();
  });
});
