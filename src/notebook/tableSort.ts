// Table → Sort: reorder the body rows by the column the cursor is in.
// Header rows stay on top; numbers sort as numbers ("9" before "10");
// empty cells go last either way; equal rows keep their order.
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { isInTable, selectedRect } from '@tiptap/pm/tables';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const asNumber = (text: string) => {
  const cleaned = text.replace(/[,\s]/g, '').replace(/^[$€£¥₹]/, '').replace(/%$/, '');
  return cleaned && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned) ? Number(cleaned) : null;
};

export function compareCells(a: string, b: string): number {
  const x = a.trim(), y = b.trim();
  if (!x || !y) return x ? -1 : y ? 1 : 0;
  const nx = asNumber(x), ny = asNumber(y);
  if (nx !== null && ny !== null) return nx - ny;
  return collator.compare(x, y);
}

/** Sort the table around the selection. Returns a message when it can't. */
export function sortTable(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, direction: 'asc' | 'desc'): string | null {
  if (!isInTable(state)) return 'Put the cursor in the column to sort by.';
  const rect = selectedRect(state), table = rect.table;
  let merged = false;
  table.descendants(node => { if ((node.attrs.rowspan ?? 1) > 1 || (node.attrs.colspan ?? 1) > 1) merged = true; return !merged; });
  if (merged) return 'Tables with merged cells can’t be sorted. Split the cells first.';
  const rows: PMNode[] = [];
  table.forEach(row => rows.push(row));
  const isHeader = (row: PMNode) => { let all = true; row.forEach(cell => { if (cell.type.name !== 'tableHeader') all = false; }); return all; };
  const headerCount = rows.findIndex(row => !isHeader(row));
  if (headerCount < 0) return 'This table has only header rows.';
  const body = rows.slice(headerCount);
  if (body.length < 2) return 'There’s nothing to sort yet: add another row.';
  const column = rect.left;
  const key = (row: PMNode) => column < row.childCount ? row.child(column).textContent : '';
  const sign = direction === 'asc' ? 1 : -1;
  const sorted = body.map((row, i) => ({ row, i, text: key(row) })).sort((a, b) => {
    const emptyA = !a.text.trim(), emptyB = !b.text.trim();
    if (emptyA !== emptyB) return emptyA ? 1 : -1; // Empty cells last in both directions.
    return sign * compareCells(a.text, b.text) || a.i - b.i;
  });
  if (sorted.every((entry, i) => entry.i === i)) return null;
  dispatch?.(state.tr.replaceWith(rect.tableStart, rect.tableStart + table.content.size, Fragment.from([...rows.slice(0, headerCount), ...sorted.map(s => s.row)])).scrollIntoView());
  return null;
}
