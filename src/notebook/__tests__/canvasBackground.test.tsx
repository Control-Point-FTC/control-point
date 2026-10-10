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
    expect(backgroundStyle({ color: null, image: { ...picture.image, fit: 'center' } }, 'blob:x')).toMatchObject({ backgroundPosition: 'center center', backgroundSize: 'auto' });
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

  it("keeps a collaborator's newer color when an upload finishes, and trusts the server's file type", async () => {
    const s = sync(), notify = vi.fn();
    let finish!: (r: Response) => void;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(r => { finish = r; }) as any);
    const view = render(<FormatBackground sync={s} editable notify={notify} />);
    const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'grid.png', { type: 'image/png' })] } });
    s.doc.getMap('meta').set('canvasBackground', { color: '#1f2937', image: null }); // a collaborator picks a color meanwhile
    finish(new Response(JSON.stringify({ id: 5, mimeType: 'image/png' }), { status: 200 }));
    await waitFor(() => expect(readBackground(s.doc)).toEqual({ color: '#1f2937', image: { type: 'image', fileId: 5, fit: 'cover' } }));
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 6, mimeType: 'text/html' }), { status: 200 }));
    fireEvent.change(input, { target: { files: [new File(['<html>'], 'fake.png', { type: 'image/png' })] } });
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("isn’t a picture")));
    expect(readBackground(s.doc)?.image?.fileId).toBe(5);
  });

  it('cancels an upload when the control goes away, without touching the page', async () => {
    const s = sync();
    let signal!: AbortSignal;
    vi.mocked(apiFetch).mockImplementationOnce((_url, init: any) => { signal = init.signal; return new Promise(() => {}) as any; });
    const view = render(<FormatBackground sync={s} editable />);
    fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'grid.png', { type: 'image/png' })] } });
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(readBackground(s.doc)).toBeNull();
  });

  it('is unavailable without edit rights', () => {
    render(<FormatBackground sync={sync()} editable={false} />);
    expect((screen.getByRole('button', { name: 'Format background' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
