import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { BLOCK_MENU_EVENT, BlockMoves } from '../blockMoves';
import { BlockHandle } from '../BlockHandle';

const editors: Editor[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => { e.view.dom.remove(); e.destroy(); }); });
function make() {
  const element = document.createElement('div'); document.body.appendChild(element);
  const editor = new Editor({ element, extensions: [...notebookExtensions(false), BlockMoves], content: { type: 'doc', content: [
    { type: 'paragraph', attrs: { id: 'a' }, content: [{ type: 'text', text: 'First' }] },
    { type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'Second' }] },
  ] } });
  editors.push(editor);
  return editor;
}

describe('block handle', () => {
  it('closes the menu when a collaborator deletes its block, so hovering works again', async () => {
    const editor = make();
    render(<BlockHandle editor={editor} pageId={1} />);
    act(() => { editor.commands.setTextSelection(2); editor.view.dom.dispatchEvent(new CustomEvent(BLOCK_MENU_EVENT)); });
    expect(await screen.findByRole('menuitem', { name: 'Delete block' })).toBeInTheDocument();
    act(() => { editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'Second' }] }] }); });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Delete block' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Block options' })).toBeNull();
    fireEvent.mouseMove(editor.view.dom.firstElementChild!);
    expect(await screen.findByRole('button', { name: 'Block options' })).toBeInTheDocument();
  });
});
