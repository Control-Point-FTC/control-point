import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { notebookSchema } from '../editorSchema';
import { registerNotebookSelection, selectedNotebookBlocks, useBrunoNotebookPage } from '../brunoScreen';
import { clearScreenContext, getScreenEntity, setScreenEntity } from '../../services/brunoContext';

const p = (id: string, text: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const cell = (id: string, text: string) => ({ type: 'tableCell', attrs: { id: `c-${id}` }, content: [p(id, text)] });

describe('selectedNotebookBlocks', () => {
  it('returns the innermost text blocks, not the whole table or list', () => {
    const doc = notebookSchema.nodeFromJSON({ type: 'doc', content: [
      { type: 'table', attrs: { id: 'table' }, content: Array.from({ length: 30 }, (_, r) => ({ type: 'tableRow', attrs: { id: `r${r}` }, content: [cell(`a${r}`, `row ${r}`), cell(`b${r}`, 'x')] })) },
    ] });
    // Select inside the last row's first cell only.
    let target = 0;
    doc.descendants((node, pos) => { if (node.attrs?.id === 'a29') target = pos; });
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, target + 1, target + 4) });
    expect(selectedNotebookBlocks(state)).toEqual(['a29']);
    const empty = EditorState.create({ doc, selection: TextSelection.create(doc, target + 1) });
    expect(selectedNotebookBlocks(empty)).toBeNull();
  });
});

function Probe({ id, locked }: { id: number | null; locked: boolean }) { useBrunoNotebookPage(id, locked); return null; }

describe('useBrunoNotebookPage', () => {
  beforeEach(() => clearScreenContext());
  it('follows the active page, clears selections on change, never reports protected pages', () => {
    const view = render(<Probe id={1} locked={false} />);
    expect(getScreenEntity('notebookPageId')).toBe(1);
    setScreenEntity('notebookBlockIds', ['x']);
    view.rerender(<Probe id={2} locked={false} />);
    expect(getScreenEntity('notebookPageId')).toBe(2);
    expect(getScreenEntity('notebookBlockIds')).toBeUndefined();
    view.rerender(<Probe id={2} locked />);
    expect(getScreenEntity('notebookPageId')).toBeUndefined();
    view.rerender(<Probe id={3} locked={false} />);
    view.unmount();
    expect(getScreenEntity('notebookPageId')).toBeUndefined();
  });
});

describe('selected attachments and pane switches', () => {
  beforeEach(() => clearScreenContext());
  it('includes a selected attachment block', () => {
    const doc = notebookSchema.nodeFromJSON({ type: 'doc', content: [p('a', 'Intro'), { type: 'notebookFile', attrs: { id: 'file1', fileId: 3, name: 'spec.pdf', mimeType: 'application/pdf', size: 10 } }] });
    let pos = 0;
    doc.descendants((node, at) => { if (node.type.name === 'notebookFile') pos = at; });
    expect(selectedNotebookBlocks(EditorState.create({ doc, selection: NodeSelection.create(doc, pos) }))).toEqual(['file1']);
  });
  it("reports the newly active pane's existing selection", () => {
    const off = registerNotebookSelection(7, () => ['sel-7']);
    const view = render(<Probe id={6} locked={false} />);
    expect(getScreenEntity('notebookBlockIds')).toBeUndefined();
    view.rerender(<Probe id={7} locked={false} />);
    expect(getScreenEntity('notebookBlockIds')).toEqual(['sel-7']);
    off();
    view.unmount();
  });
});
