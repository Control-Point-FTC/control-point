import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotebookAttachment, NotebookFileContext } from '../NotebookAttachments';
import { apiFetch } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const context: any = { sync: { pageId: 1, scope: { teamId: 2 } }, mobile: false, editable: true, drawingScope: null, setDrawingScope: vi.fn(), onRibbon: vi.fn(), onEditorFocus: vi.fn(), onEditorRemoved: vi.fn(), onSelectionChange: vi.fn() };
function view(alt: string | null, updateAttributes = vi.fn()) {
  const node: any = { attrs: { fileId: 5, name: 'gear.png', size: 10, mimeType: 'image/png', display: 'image', width: 640, alt, id: 'f1' } };
  const Comp = NotebookAttachment as any;
  const utils = render(<NotebookFileContext.Provider value={context}><Comp node={node} updateAttributes={updateAttributes} /></NotebookFileContext.Provider>);
  return { ...utils, updateAttributes, rerenderWith: (next: string | null) => utils.rerender(<NotebookFileContext.Provider value={context}><Comp node={{ attrs: { ...node.attrs, alt: next } }} updateAttributes={updateAttributes} /></NotebookFileContext.Provider>) };
}

describe('image alt text and copy', () => {
  it('follows the saved description and saves only real edits', () => {
    vi.mocked(apiFetch).mockImplementation(async () => new Response(new Blob(['x'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    const v = view('Old');
    const field = screen.getByLabelText('Image description (alt text)') as HTMLInputElement;
    expect(field.value).toBe('Old');
    v.rerenderWith('From a teammate');            // undo or someone else's change
    expect(field.value).toBe('From a teammate');
    fireEvent.focus(field); fireEvent.blur(field); // no edit: nothing written back
    expect(v.updateAttributes).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '  Top view of the gearbox ' } }); fireEvent.blur(field);
    expect(v.updateAttributes).toHaveBeenCalledWith({ alt: 'Top view of the gearbox' });
  });

  it('starts the clipboard write during the click with a PNG promise', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => new Response(new Blob(['x'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    const items: any[] = [];
    class FakeItem { constructor(public data: Record<string, unknown>) { items.push(this); } }
    vi.stubGlobal('ClipboardItem', FakeItem);
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    view(null);
    fireEvent.click(screen.getByRole('button', { name: 'Copy image' }));
    expect(write).toHaveBeenCalledTimes(1);          // synchronously, inside the click
    expect(items[0].data['image/png']).toBeInstanceOf(Promise);
    await act(async () => { await items[0].data['image/png']; });
    expect(await screen.findByText('Image copied.')).toBeTruthy();
  });
});
