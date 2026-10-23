import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotebookAttachment, NotebookFileContext } from '../NotebookAttachments';
import { dragCrop } from '../NotebookImage';
import { cropText, parseCrop, validNotebookFile } from '../fileNode';
import { validatedNotebookDocument } from '../editorSchema';
import { apiFetch } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const base = { fileId: 5, name: 'gear.png', size: 10, mimeType: 'image/png', display: 'image', width: 640, alt: null, id: 'f1' };
function picture(attrs: Record<string, unknown> = {}, { editable = true, selected = true } = {}) {
  vi.mocked(apiFetch).mockImplementation(async () => new Response(new Blob(['x'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
  const context: any = { sync: { pageId: 1, scope: { teamId: 2 } }, mobile: false, editable, drawingScope: null, setDrawingScope: vi.fn(), onRibbon: vi.fn(), onEditorFocus: vi.fn(), onEditorRemoved: vi.fn(), onSelectionChange: vi.fn() };
  const updateAttributes = vi.fn(), deleteNode = vi.fn();
  const Comp = NotebookAttachment as any;
  render(<NotebookFileContext.Provider value={context}><Comp node={{ attrs: { ...base, ...attrs } }} updateAttributes={updateAttributes} deleteNode={deleteNode} selected={selected} /></NotebookFileContext.Provider>);
  return { updateAttributes, deleteNode };
}
/** The picture finished loading at this natural size. */
async function loaded(w = 1000, h = 500) {
  const img = await screen.findByRole('img') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true }); Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
  fireEvent.load(img);
  return img;
}

describe('picture crop format', () => {
  it('reads and writes "x,y,w,h" fractions and refuses anything outside the picture', () => {
    expect(parseCrop('0.1,0.2,0.5,0.6')).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(cropText({ x: 1 / 3, y: 0, w: 0.5, h: 1 })).toBe('0.3333,0,0.5,1');
    for (const bad of ['0.6,0,0.5,1', '-0.1,0,0.5,0.5', '0,0,0.01,1', '0,0,1', 'a,b,c,d', 7]) expect(parseCrop(bad), String(bad)).toBeNull();
    expect(validNotebookFile({ ...base, crop: '0.1,0.1,0.5,0.5' })).toBe(true);
    expect(validNotebookFile({ ...base, crop: '0,0,2,2' })).toBe(false);
    // Saved pages carry it through the shared validator the server also runs.
    expect(() => validatedNotebookDocument({ type: 'doc', content: [{ type: 'notebookFile', attrs: { ...base, crop: '0,0,0.5,0.5' } }] })).not.toThrow();
    expect(() => validatedNotebookDocument({ type: 'doc', content: [{ type: 'notebookFile', attrs: { ...base, crop: '0,0,9,9' } }] })).toThrow();
  });

  it('drags crop edges inside the picture and keeps a minimum size', () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    expect(dragCrop(full, 'w', 0.25, 0)).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
    expect(dragCrop(full, 'se', -0.5, -0.4)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.6 });
    expect(dragCrop(full, 'e', -2, 0).w).toBeCloseTo(0.05);
    expect(dragCrop({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'move', 0.9, -0.9)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    // A 640px picture can't crop narrower than the 120px a picture may be (120/640 of its width).
    expect(dragCrop(full, 'e', -0.99, 0, 120 / 640).w).toBeCloseTo(120 / 640);
    expect(dragCrop(full, 'w', 0.99, 0, 120 / 640)).toMatchObject({ w: expect.closeTo(120 / 640), x: expect.closeTo(1 - 120 / 640) });
  });
});

describe('notebook picture', () => {
  it('resizes from a corner and saves the width once, on release', async () => {
    const { updateAttributes } = picture();
    await loaded();
    const corner = document.querySelector('.nb-image-handle.is-se')!;
    fireEvent.pointerDown(corner, { clientX: 640, pointerId: 1 });
    fireEvent.pointerMove(corner, { clientX: 400, pointerId: 1 });
    expect(screen.getByRole('status')).toHaveTextContent(/px/);
    expect(updateAttributes).not.toHaveBeenCalled();
    fireEvent.pointerUp(corner, { clientX: 400, pointerId: 1 });
    expect(updateAttributes).toHaveBeenCalledTimes(1);
    expect(updateAttributes.mock.calls[0][0]).toMatchObject({ display: 'image' });
    expect(updateAttributes.mock.calls[0][0].width).toBeGreaterThanOrEqual(120);
  });

  it('crops in place and keeps the visible part at the same scale', async () => {
    const { updateAttributes } = picture({ width: 600 });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
    expect(document.querySelector('.nb-crop-box')).toBeTruthy();
    const box = document.querySelector('.nb-image-frame')! as HTMLElement;
    box.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 300, right: 600, bottom: 300, toJSON: () => ({}) });
    const right = document.querySelector('.nb-crop-handle.is-e')!;
    fireEvent.pointerDown(right, { clientX: 600, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(right, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(right, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(updateAttributes).toHaveBeenCalledWith({ display: 'image', crop: '0,0,0.5,1', width: 300 });
  });

  it('never saves a crop wider than it looks: the narrowest crop is the smallest picture width', async () => {
    const { updateAttributes } = picture({ width: 640 });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
    (document.querySelector('.nb-image-frame') as HTMLElement).getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320, toJSON: () => ({}) });
    const right = document.querySelector('.nb-crop-handle.is-e')!;
    fireEvent.pointerDown(right, { clientX: 640, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(right, { clientX: 0, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(right, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(updateAttributes).toHaveBeenCalledWith(expect.objectContaining({ width: 120 }));
    expect(parseCrop(updateAttributes.mock.calls[0][0].crop)!.w * 640).toBeCloseTo(120, 0);
  });

  it('leaves Enter on Cancel and Reset to those buttons, and applies from the crop box', async () => {
    const { updateAttributes } = picture({ width: 600 });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
    const box = screen.getByRole('group', { name: /Crop area/ });
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reset' }), { key: 'Enter' });
    expect(updateAttributes).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /Crop area/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
    fireEvent.keyDown(screen.getByRole('group', { name: /Crop area/ }), { key: 'Enter' });
    expect(updateAttributes).toHaveBeenCalledWith({ display: 'image', crop: null, width: 600 });
  });

  it('shows a cropped picture through a frame of the visible part', async () => {
    picture({ crop: '0.25,0,0.5,1', width: 300 });
    const img = await loaded(1000, 500);
    const frame = document.querySelector('.nb-image-frame') as HTMLElement;
    expect(frame.style.aspectRatio).toBe('500 / 500');
    expect(img.style.width).toBe('200%');
    expect(img.style.left).toBe('-50%');
  });

  it('puts everything in a right-click menu, with editing only for editors', async () => {
    const { updateAttributes, deleteNode } = picture({ crop: '0,0,0.5,0.5', width: 200 });
    const img = await loaded(800, 400);
    fireEvent.contextMenu(img);
    for (const name of ['Copy image', 'Save as…', 'Open in new tab', 'Copy link to picture', 'Crop', 'Restore to original size', 'Alt text…', 'Delete picture']) expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore to original size' }));
    expect(updateAttributes).toHaveBeenCalledWith({ display: 'image', crop: null, width: 800 });
    fireEvent.contextMenu(img);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete picture' }));
    expect(deleteNode).toHaveBeenCalled();
  });

  it('gives readers the menu without editing, handles or the description field', async () => {
    picture({}, { editable: false });
    const img = await loaded();
    expect(document.querySelector('.nb-image-handle')).toBeNull();
    expect(screen.queryByLabelText('Image description (alt text)')).toBeNull();
    fireEvent.contextMenu(img);
    expect(await screen.findByRole('menuitem', { name: 'Save as…' })).toBeTruthy();
    for (const name of ['Crop', 'Restore to original size', 'Alt text…', 'Delete picture']) expect(screen.queryByRole('menuitem', { name })).toBeNull();
  });

  it('hides the handles and tools until the picture is selected', async () => {
    picture({}, { selected: false });
    await loaded();
    expect(document.querySelector('.nb-image-handle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Crop' })).toBeNull();
    expect(screen.getByText('gear.png')).toBeTruthy();
    await act(async () => { fireEvent.focus(screen.getByRole('button', { name: 'Picture actions for gear.png' })); });
    expect(document.querySelector('.nb-image-handle')).toBeTruthy();
  });
});
