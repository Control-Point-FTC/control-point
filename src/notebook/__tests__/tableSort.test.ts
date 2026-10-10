import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { notebookExtensions } from '../editorSchema';
import { compareCells, sortTable } from '../tableSort';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(e => e.destroy()));
const cell = (t: string, header = false) => header ? `<th><p>${t}</p></th>` : `<td><p>${t}</p></td>`;
function table(rows: string[][], header = true) {
  const html = '<table>' + rows.map((r, i) => `<tr>${r.map(t => cell(t, header && i === 0)).join('')}</tr>`).join('') + '</table>';
  const editor = new Editor({ extensions: notebookExtensions(false), content: html });
  editors.push(editor); return editor;
}
/** Put the cursor in a cell (row, column) of the first table. */
function cursorIn(editor: Editor, row: number, col: number) {
  let found = -1, r = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === 'tableRow') { r++; if (r === row) { let c = 0; node.forEach((_cell, offset) => { if (c++ === col) found = pos + 1 + offset + 2; }); } return false; }
    return true;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, found)));
}
const column = (editor: Editor, col: number) => {
  const out: string[] = [];
  editor.state.doc.descendants(node => { if (node.type.name === 'tableRow') { out.push(node.child(col).textContent); return false; } return true; });
  return out;
};

describe('table sort', () => {
  it('sorts body rows by the cursor column, numbers as numbers, header kept on top', () => {
    const editor = table([['Part', 'Qty'], ['Bolt', '10'], ['axle', '9'], ['Gear', ''], ['Belt', '100']]);
    cursorIn(editor, 2, 1);
    expect(sortTable(editor.state, editor.view.dispatch, 'asc')).toBeNull();
    expect(column(editor, 1)).toEqual(['Qty', '9', '10', '100', '']);
    expect(column(editor, 0)).toEqual(['Part', 'axle', 'Bolt', 'Belt', 'Gear']);
    cursorIn(editor, 1, 0);
    sortTable(editor.state, editor.view.dispatch, 'desc');
    expect(column(editor, 0)).toEqual(['Part', 'Gear', 'Bolt', 'Belt', 'axle']);
  });

  it('explains when it cannot sort', () => {
    const outside = new Editor({ extensions: notebookExtensions(false), content: '<p>No table</p>' }); editors.push(outside);
    expect(sortTable(outside.state, outside.view.dispatch, 'asc')).toMatch(/cursor in the column/);
    const one = table([['Name'], ['Only']]);
    cursorIn(one, 1, 0);
    expect(sortTable(one.state, one.view.dispatch, 'asc')).toMatch(/nothing to sort/);
    const merged = new Editor({ extensions: notebookExtensions(false), content: '<table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td colspan="2"><p>x</p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>' }); editors.push(merged);
    cursorIn(merged, 2, 0);
    expect(sortTable(merged.state, merged.view.dispatch, 'asc')).toMatch(/merged cells/);
  });

  it('keeps the cursor in its cell as the row moves', () => {
    const editor = table([['Part'], ['Gear'], ['Axle'], ['Bolt']]);
    cursorIn(editor, 1, 0);                         // in "Gear"
    editor.commands.setTextSelection(editor.state.selection.from + 2); // "Ge|ar"
    sortTable(editor.state, editor.view.dispatch, 'asc');
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe('Gear');
    expect($from.parentOffset).toBe(2);
  });

  it('orders mixed numbers and text the same way whatever the starting order', () => {
    const values = ['1,000', '900', '2x'];
    const once = [...values].sort(compareCells), again = [...values].reverse().sort(compareCells);
    expect(once).toEqual(['900', '1,000', '2x']);
    expect(again).toEqual(once);
  });

  it('compares money, percentages and text sensibly', () => {
    expect(['$1,200', '$95', '$1,000'].sort(compareCells)).toEqual(['$95', '$1,000', '$1,200']);
    expect(['10%', '9%'].sort(compareCells)).toEqual(['9%', '10%']);
    expect(['Item 10', 'item 9'].sort(compareCells)).toEqual(['item 9', 'Item 10']);
  });
});
