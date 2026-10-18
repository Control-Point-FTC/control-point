import React from 'react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NotebookToolbar } from '../NotebookToolbar';
import { notebookExtensions } from '../editorSchema';
import { NotebookWorkspaceContext, type NotebookWorkspace } from '../workspaceContext';
import { densityKey, resetDensityMemory } from '../ribbon/density';

let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); localStorage.clear(); resetDensityMemory(); });

const workspace = (extra: Partial<NotebookWorkspace> = {}): NotebookWorkspace => ({ teamId: 1, memberId: 7, tree: null, openPage() {}, refreshTree() {}, openTrash() {}, toggleStickyNotes() {}, stickyNotesOpen: false, ...extra });
/** Redraws on every transaction, as the notebook editor does. */
function Live({ ed }: { ed: Editor }) {
  const [, redraw] = React.useState(0);
  React.useEffect(() => { const update = () => redraw(n => n + 1); ed.on('transaction', update); return () => { ed.off('transaction', update); }; }, [ed]);
  return <NotebookToolbar editor={ed} disabled={false} pages={[]} pageId={1} preferenceKey="density-test" />;
}
function mount(html = '<p>Hello world</p>', ws: NotebookWorkspace | null = workspace()) {
  editor = new Editor({ extensions: notebookExtensions(false, true), content: html });
  const toolbar = <Live ed={editor} />;
  const view = render(ws ? <NotebookWorkspaceContext.Provider value={ws}>{toolbar}</NotebookWorkspaceContext.Provider> : toolbar);
  editor.commands.focus();
  return view;
}
const bar = () => document.querySelector('.nb-command-bar')!;
const toolbar = () => screen.getByRole('toolbar');
const openMenu = (button: HTMLElement) => fireEvent.keyDown(button, { key: 'Enter' });
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
/** Every command name on the visible toolbar: buttons and fields, plus the
 *  items inside each of its menus. */
function commands(): Set<string> {
  const names = new Set<string>();
  const controls = within(toolbar()).getAllByRole('button').concat(within(toolbar()).queryAllByRole('combobox'));
  for (const control of controls) {
    const name = control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '';
    if (control.getAttribute('aria-haspopup') === 'menu') {
      openMenu(control);
      for (const item of [...document.querySelectorAll('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]')]) names.add((item.getAttribute('aria-label') ?? item.textContent ?? '').trim());
      closeMenu();
    } else names.add(name);
  }
  return names;
}

describe('toolbar density', () => {
  it('starts compact: one row of icon-only commands with names on hover and for screen readers', () => {
    mount();
    expect(bar()).toHaveAttribute('data-density', 'compact');
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold.textContent).toBe('');
    expect(bold).toHaveAttribute('title', 'Bold (Ctrl+B)');
    // Labelled commands drop their labels too.
    expect(screen.getByRole('button', { name: 'Paste' }).textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Show the full toolbar' })).toHaveAttribute('aria-pressed', 'false');
    // Grouped into menus: lists, alignment, more text formatting, tags.
    for (const name of ['Lists', 'Alignment', 'More text formatting', 'Tag']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('remembers the expanded view for this member, separately from hiding the toolbar', () => {
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Show the full toolbar' }));
    expect(bar()).toHaveAttribute('data-density', 'expanded');
    expect(localStorage.getItem(densityKey(7))).toBe('expanded');
    expect(screen.getByRole('button', { name: 'Paste' }).textContent).toBe('Paste');
    expect(screen.getByRole('button', { name: 'Bullets' })).toBeTruthy();
    // Hiding the toolbar is its own choice and keeps the density.
    fireEvent.click(screen.getByRole('button', { name: 'Hide the ribbon' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(localStorage.getItem('density-test:collapsed')).toBe('1');
    expect(localStorage.getItem(densityKey(7))).toBe('expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Show the ribbon' }));
    first.unmount(); editor.destroy();
    mount();
    expect(bar()).toHaveAttribute('data-density', 'expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Use the compact toolbar' }));
    expect(localStorage.getItem(densityKey(7))).toBe('compact');
    expect(bar()).toHaveAttribute('data-density', 'compact');
    // Another member on this device still starts compact.
    cleanup(); editor.destroy();
    localStorage.setItem(densityKey(7), 'expanded');
    mount(undefined, workspace({ memberId: 8 }));
    expect(bar()).toHaveAttribute('data-density', 'compact');
  });

  it('keeps the choice for the visit when the browser blocks storage', () => {
    mount(undefined, null);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Show the full toolbar' }));
      expect(bar()).toHaveAttribute('data-density', 'expanded');
    } finally { Storage.prototype.setItem = setItem; }
  });

  it('keeps every command reachable in compact mode, on every tab', () => {
    for (const [tab, html] of [['Home', '<p>Hello world</p>'], ['Insert', '<table><tr><td><p>Cell</p></td></tr></table>'], ['Review', '<p>x</p>'], ['Help', '<p>x</p>']] as const) {
      mount(html);
      if (tab === 'Insert') editor.commands.setTextSelection(3);
      fireEvent.click(screen.getByRole('button', { name: 'Show the full toolbar' }));
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      const expanded = commands();
      fireEvent.click(screen.getByRole('button', { name: 'Use the compact toolbar' }));
      const compact = commands();
      // Split buttons' arrows are menus of the same commands in both views.
      const missing = [...expanded].filter(name => !compact.has(name) && !['Subscript and superscript'].includes(name));
      expect(missing, `${tab}: ${missing.join(', ')}`).toEqual([]);
      cleanup(); editor.destroy(); localStorage.clear();
    }
  });

  it('applies grouped commands from their menus and shows them as active', () => {
    mount('<p>Hello world</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    openMenu(screen.getByRole('button', { name: 'Lists' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Numbering' }));
    expect(editor.getHTML()).toContain('<ol');
    expect(screen.getByRole('button', { name: 'Lists' })).toHaveClass('is-active');
    openMenu(screen.getByRole('button', { name: 'Lists' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Numbering' })).toHaveAttribute('aria-checked', 'true');
    closeMenu();
    openMenu(screen.getByRole('button', { name: 'More text formatting' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Superscript' }));
    expect(editor.getHTML()).toContain('<sup>');
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves between commands with the arrow keys, and leaves a text field at its edge', () => {
    mount();
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.keyDown(undo, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(undo).toHaveFocus();
    fireEvent.keyDown(undo, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Show the full toolbar' })).not.toHaveFocus(); // the chevron is outside the row
    const size = screen.getByRole('combobox', { name: 'Font size' }) as HTMLInputElement;
    size.focus(); size.value = '12'; size.setSelectionRange(1, 1);
    fireEvent.keyDown(size, { key: 'ArrowRight' });
    expect(size).toHaveFocus(); // the caret moves inside the field
    size.setSelectionRange(2, 2);
    fireEvent.keyDown(size, { key: 'ArrowRight' });
    expect(size).not.toHaveFocus();
  });

  it('puts page actions in the page bar slot, with less frequent ones under More', () => {
    const host = document.createElement('div'); document.body.append(host);
    let quick = 0;
    editor = new Editor({ extensions: notebookExtensions(false, true), content: '<p>x</p>' });
    render(<NotebookWorkspaceContext.Provider value={workspace({ pageActions: [{ label: 'Quick note', onSelect: () => { quick++; } }] })}>
      <NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} barHost={host} status={<span>Saved here</span>} />
    </NotebookWorkspaceContext.Provider>);
    expect(within(host).getByText('Saved here')).toBeTruthy();
    expect(within(host).getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(within(host).getByRole('button', { name: 'Hide the ribbon' })).toBeTruthy();
    openMenu(within(host).getByRole('button', { name: 'More page actions' }));
    act(() => { fireEvent.click(screen.getByRole('menuitem', { name: 'Quick note' })); });
    expect(quick).toBe(1);
    host.remove();
  });
});
