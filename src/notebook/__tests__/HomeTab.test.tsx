import React from 'react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import { NotebookToolbar } from '../NotebookToolbar';
import { notebookExtensions } from '../editorSchema';
let editor: Editor;
afterEach(() => { cleanup(); editor?.destroy(); localStorage.clear(); vi.restoreAllMocks(); });
const mount = (html = '<p>Hello world</p>') => {
  editor = new Editor({ extensions: notebookExtensions(false, true), content: html });
  render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} preferenceKey="ribbon-test" />);
  editor.commands.focus();
};
const openMenu = (name: string) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });

describe('Home ribbon', () => {
  it('shows every OneNote tab in order, always', () => {
    mount();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['File', 'Home', 'Insert', 'Draw', 'History', 'Review', 'View', 'Help']);
    expect(screen.getByRole('toolbar', { name: 'Home commands' })).toBeTruthy();
    for (const group of ['Clipboard', 'Basic text', 'Paragraph', 'Tags', 'Styles']) expect(screen.getByRole('group', { name: group })).toBeTruthy();
  });

  it('applies a palette font color and highlight, and remembers the last color on the split button', () => {
    mount();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    openMenu('Font color options');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Font color: #22c55e' }));
    const colors = () => JSON.stringify(editor.getJSON()).match(/#22c55e/g) ?? [];
    expect(colors()).toHaveLength(1);
    editor.commands.setTextSelection({ from: 7, to: 12 });
    fireEvent.click(screen.getByRole('button', { name: 'Font color' }));
    expect(colors()).toHaveLength(2);
    openMenu('Highlight colors');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Highlight: #86efac' }));
    expect(editor.getHTML()).toContain('data-color="#86efac"');
  });

  it('format painter copies formatting and applies it to the next selection', () => {
    mount('<p><strong>Bold</strong> plain</p>');
    editor.commands.setTextSelection(2);
    fireEvent.click(screen.getByRole('button', { name: 'Format painter' }));
    expect(screen.getByRole('button', { name: 'Format painter' })).toHaveAttribute('aria-pressed', 'true');
    act(() => { editor.commands.setTextSelection({ from: 6, to: 11 }); });
    fireEvent.pointerUp(editor.view.dom);
    expect(editor.getHTML().replace(/ data-id="[^"]*"/g, '')).toBe('<p><strong>Bold</strong> <strong>plain</strong></p>');
    expect(screen.getByRole('button', { name: 'Format painter' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('pastes clipboard text as real paragraphs, and explains when the browser blocks it', async () => {
    mount('<p></p>');
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue('one\ntwo'), read: undefined, writeText: vi.fn() } });
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    await act(async () => {});
    expect(editor.getHTML().replace(/ data-id="[^"]*"/g, '')).toContain('<p>one</p><p>two</p>');
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) } });
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(await screen.findByText(/keeps the clipboard private/)).toBeTruthy();
  });

  it('sets styles, alignment and tags', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Paragraph style'), { target: { value: 'quote' } });
    expect(editor.getHTML()).toMatch(/<blockquote/);
    fireEvent.change(screen.getByLabelText('Paragraph style'), { target: { value: 'paragraph' } });
    // Normal leaves the quote entirely.
    expect(editor.getHTML()).not.toMatch(/<blockquote/);
    expect((screen.getByLabelText('Paragraph style') as HTMLSelectElement).value).toBe('paragraph');
    openMenu('Alignment');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align center' }));
    expect(editor.getHTML()).toContain('text-align: center');
    openMenu('Tag');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Important' }));
    expect(editor.getHTML()).toContain('data-nb-tag="important"');
  });

  it('font size accepts 8–96 and refuses others with a message', () => {
    mount();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const size = screen.getByRole('combobox', { name: 'Font size' }) as HTMLInputElement;
    fireEvent.change(size, { target: { value: '30' } }); fireEvent.blur(size);
    expect(editor.getHTML()).toContain('font-size: 30px');
    fireEvent.change(size, { target: { value: '400' } }); fireEvent.blur(size);
    expect(screen.getByText('Font sizes go from 8 to 96.')).toBeTruthy();
  });

  it('hides and restores the ribbon, keeping the choice on this device', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the ribbon' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(localStorage.getItem('ribbon-test:collapsed')).toBe('1');
    fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
    expect(screen.getByRole('toolbar', { name: 'Insert commands' })).toBeTruthy();
  });

  it('opens the keyboard shortcut reference from Help', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });
});

describe('Home ribbon state and safety', () => {
  it('keeps the remembered color and an armed format painter across tab switches', () => {
    mount();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    openMenu('Font color options');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Font color: #3b82f6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Format painter' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
    expect(screen.getByRole('button', { name: 'Format painter' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Format painter' }));
    editor.commands.setTextSelection({ from: 7, to: 12 });
    fireEvent.click(screen.getByRole('button', { name: 'Font color' }));
    expect(JSON.stringify(editor.getJSON()).match(/#3b82f6/g)).toHaveLength(2);
  });

  it('removes old text fills from the highlight menu', () => {
    mount('<p><span style="background-color: #fde047">Filled</span> text</p>');
    editor.commands.setTextSelection({ from: 1, to: 7 });
    openMenu('Highlight colors');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove text fill' }));
    expect(JSON.stringify(editor.getJSON())).not.toContain('backgroundColor":"#fde047');
  });

  it('cut never deletes text when the page changed while the clipboard was pending', async () => {
    mount('<p>Hello world</p>');
    const original = document.execCommand;
    document.execCommand = () => false;
    let release!: () => void;
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => new Promise<void>(r => { release = r; })) } });
    editor.commands.setTextSelection({ from: 7, to: 12 });
    fireEvent.click(screen.getByRole('button', { name: 'Cut' }));
    act(() => { editor.commands.insertContentAt(1, 'Oh '); });
    await act(async () => { release(); });
    expect(editor.getText()).toBe('Oh Hello world');
    expect(await screen.findByText(/changed before it could be cut/)).toBeTruthy();
    document.execCommand = original;
  });

  it('returns focus to the menu button when a menu is cancelled', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Alignment' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await screen.findByRole('menuitemradio', { name: 'Align center' });
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
