// Moving, duplicating and deleting whole top-level blocks (paragraphs,
// headings, lists, tables, files…), used by the block handle and by
// Alt+Shift+↑/↓. Each is one transaction, so one undo step.
import { Extension, type Editor } from '@tiptap/core';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

/** The top-level block at index `index`: its start and end positions. */
export function blockRange(state: EditorState, index: number) {
  if (index < 0 || index >= state.doc.childCount) return null;
  let from = 0;
  for (let i = 0; i < index; i++) from += state.doc.child(i).nodeSize;
  return { from, to: from + state.doc.child(index).nodeSize, node: state.doc.child(index) };
}

/** Index of the top-level block containing a position. */
export function blockIndexAt(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  return $pos.depth === 0 ? Math.min($pos.index(0), state.doc.childCount - 1) : $pos.index(0);
}

export function moveBlock(state: EditorState, index: number, direction: -1 | 1): Transaction | null {
  const target = index + direction, a = blockRange(state, index), b = blockRange(state, target);
  if (!a || !b) return null;
  const [first, second] = direction === -1 ? [b, a] : [a, b];
  const tr = state.tr.replaceWith(first.from, second.to, [second.node, first.node]);
  // Keep the cursor in the moved block.
  const offset = Math.max(0, Math.min(state.selection.from - a.from, a.node.nodeSize - 1));
  const start = direction === -1 ? b.from : b.from + b.node.nodeSize - a.node.nodeSize;
  try { tr.setSelection(TextSelection.near(tr.doc.resolve(start + offset))); } catch { /* selection stays mapped */ }
  return tr.scrollIntoView();
}

export function duplicateBlock(state: EditorState, index: number): Transaction | null {
  const a = blockRange(state, index);
  return a ? state.tr.insert(a.to, a.node.type.create({ ...a.node.attrs, id: null }, a.node.content, a.node.marks)) : null;
}

export function deleteBlock(state: EditorState, index: number): Transaction | null {
  const a = blockRange(state, index);
  if (!a) return null;
  // Never leave the page without a paragraph to type into.
  if (state.doc.childCount === 1) return state.tr.replaceWith(a.from, a.to, state.schema.nodes.paragraph.create());
  return state.tr.delete(a.from, a.to);
}

export function runBlock(editor: Editor, make: (state: EditorState) => Transaction | null) {
  if (!editor.isEditable) return false;
  const tr = make(editor.state);
  if (!tr) return false;
  editor.view.dispatch(tr);
  editor.commands.focus();
  return true;
}

/** Alt+Shift+↑/↓ moves the block the cursor is in. */
export const BlockMoves = Extension.create({
  name: 'notebookBlockMoves',
  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => runBlock(this.editor, state => moveBlock(state, blockIndexAt(state, state.selection.from), direction));
    return { 'Alt-Shift-ArrowUp': move(-1), 'Alt-Shift-ArrowDown': move(1) };
  },
});
