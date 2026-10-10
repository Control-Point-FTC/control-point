import React from 'react';
import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BACKGROUND_KEY, canvasJSON, readBackground, seedCanvas, validatedCanvas } from '../canvasModel';
import { notebookAttachmentIds } from '../attachmentReferences';
import { backgroundStyle, FormatBackground } from '../canvasBackground';
import { apiFetch } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const picture = { color: '#fef9c3', image: { type: 'image' as const, fileId: 7, fit: 'tile' as const } };

describe('canvas background model', () => {
  it('validates the background and keeps it through the shared document', () => {
    expect(validatedCanvas({ version: 1, objects: [], background: picture }).background).toEqual(picture);
    for (const bad of [{ color: 'red', image: null }, { color: null, image: { type: 'image', fileId: -1, fit: 'cover' } }, { color: null, image: { type: 'image', fileId: 1, fit: 'stretch' } }, { color: null }, { color: null, image: null, extra: 1 }])
      expect(() => validatedCanvas({ version: 1, objects: [], background: bad }), JSON.stringify(bad)).toThrow();
    const doc = new Y.Doc();
    seedCanvas(doc, { version: 1, objects: [], background: picture });
    expect(readBackground(doc)).toEqual(picture);
    expect(canvasJSON(doc)).toEqual({ version: 1, objects: [], background: picture });
    doc.getMap('meta').delete(BACKGROUND_KEY);
    expect(canvasJSON(doc)).toEqual({ version: 1, objects: [] });
  });

  it('indexes the background picture as a page attachment', () => {
    expect(notebookAttachmentIds({ type: 'doc', content: [] }, { version: 1, objects: [], background: picture })).toEqual([7]);
  });

  it('renders color and the picture fit as CSS', () => {
    expect(backgroundStyle({ color: '#ffffff', image: null }, '')).toEqual({ backgroundColor: '#ffffff' });
    expect(backgroundStyle(picture, 'blob:x')).toMatchObject({ backgroundImage: 'url("blob:x")', backgroundRepeat: 'repeat' });
    expect(backgroundStyle({ color: null, image: { ...picture.image, fit: 'cover' } }, 'blob:x')).toMatchObject({ backgroundSize: 'cover', backgroundRepeat: 'no-repeat' });
  });
});

describe('Format background control', () => {
  const sync = () => ({ doc: new Y.Doc(), pageId: 3, scope: { memberId: 1, teamId: 2 } }) as any;
  const open = () => fireEvent.keyDown(screen.getByRole('button', { name: 'Format background' }), { key: 'Enter' });

  it('sets and resets a shared background color', async () => {
    const s = sync();
    render(<FormatBackground sync={s} editable />);
    open();
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Background color: #dcfce7' }));
    expect(readBackground(s.doc)).toEqual({ color: '#dcfce7', image: null });
    open();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset background' }));
    expect(readBackground(s.doc)).toBeNull();
  });

  it('uploads a picture as a page attachment and refuses other file types', async () => {
    const s = sync(), notify = vi.fn();
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ id: 42, name: 'grid.png', mimeType: 'image/png', size: 5 }), { status: 200 }));
    const view = render(<FormatBackground sync={s} editable notify={notify} />);
    const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] } });
    expect(notify).toHaveBeenCalledWith('Choose a PNG, JPEG, GIF or WebP picture.');
    fireEvent.change(input, { target: { files: [new File(['x'], 'grid.png', { type: 'image/png' })] } });
    await waitFor(() => expect(readBackground(s.doc)).toEqual({ color: null, image: { type: 'image', fileId: 42, fit: 'cover' } }));
    expect(String(vi.mocked(apiFetch).mock.calls[0][0])).toBe('/api/notebook/pages/3/files');
  });

  it('is unavailable without edit rights', () => {
    render(<FormatBackground sync={sync()} editable={false} />);
    expect((screen.getByRole('button', { name: 'Format background' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
