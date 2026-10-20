// Proof of completion: pasting a screenshot adds it, from anywhere in the
// dialog (the notes box included), whether the browser reports it in
// clipboardData.items or only in clipboardData.files. Photos being converted
// hold their slot and "Mark done" waits for them; a late conversion never
// lands after the dialog closed.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

const media = vi.hoisted(() => ({ toWebImage: vi.fn(async (f: File) => f as File | null) }));
vi.mock('../../utils/mediaFiles', async (orig) => ({ ...(await orig<object>()), toWebImage: media.toWebImage }));
const dialog = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), notify: dialog.notify }));

import { CompletionDialog } from '../pages/tasks/TaskDialogs';

afterEach(cleanup);
beforeEach(() => {
  // jsdom has no object URLs; the dialog previews each photo with one.
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:proof-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn();
  media.toWebImage.mockReset();
  media.toWebImage.mockImplementation(async (f: File) => f);
  dialog.notify.mockReset();
});

/** The dialog with a real (state-like) file list behind onFilesChange. */
function setup(notes = '') {
  const state = { files: [] as File[] };
  const onFilesChange = vi.fn((next: File[] | ((prev: File[]) => File[])) => {
    state.files = typeof next === 'function' ? next(state.files) : next;
    view.rerender(ui());
  });
  const ui = () => (
    <CompletionDialog task={{ id: 1, title: 'Wire the hub' }} notes={notes} onNotesChange={() => {}} link="" onLinkChange={() => {}} files={state.files}
      onFilesChange={onFilesChange} completing={false} onSubmit={() => {}} onClose={() => {}} />
  );
  const view = render(ui());
  return { state, onFilesChange, view };
}

const png = (name = 'shot.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
const paste = (files: File[]) => fireEvent.paste(screen.getByLabelText('What was done?'), {
  clipboardData: { items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })), files, types: ['Files'] },
});

describe('paste a screenshot as proof', () => {
  it('from items (Chrome, Edge)', async () => {
    const { state } = setup();
    const file = png();
    paste([file]);
    await waitFor(() => expect(state.files).toEqual([file]));
  });

  it('from files only (Safari, Firefox)', async () => {
    const { state } = setup();
    const file = png();
    fireEvent.paste(screen.getByLabelText('What was done?'), { clipboardData: { items: [], files: [file], types: ['Files'] } });
    await waitFor(() => expect(state.files).toEqual([file]));
  });

  it('plain text pastes normally', () => {
    const { onFilesChange } = setup();
    fireEvent.paste(screen.getByLabelText('What was done?'), {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], files: [], types: ['text/plain'] },
    });
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('says you can paste', () => {
    setup();
    expect(screen.getByText(/Ctrl\+V|⌘V/)).toBeInTheDocument();
  });

  it('only fills the free slots, and converts one at a time', async () => {
    let running = 0;
    let most = 0;
    media.toWebImage.mockImplementation(async (f: File) => {
      running += 1; most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return f;
    });
    const { state } = setup();
    paste(Array.from({ length: 8 }, (_, i) => png(`p${i}.png`)));
    await waitFor(() => expect(state.files).toHaveLength(5));
    expect(media.toWebImage).toHaveBeenCalledTimes(5);
    expect(most).toBe(1);
    expect(dialog.notify).toHaveBeenCalledWith(expect.stringMatching(/Up to 5 photos/), 'error');
  });

  it('Mark done waits while a photo is being prepared', async () => {
    let finish!: (f: File | null) => void;
    media.toWebImage.mockImplementation(() => new Promise((r) => { finish = r; }));
    const { state } = setup('Mounted it');
    const heic = new File([new Uint8Array([1])], 'IMG_1.HEIC', { type: 'image/heic' });
    paste([heic]);
    const button = await screen.findByRole('button', { name: /Preparing photos/ });
    expect(button).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Preparing photo' })).toBeInTheDocument();
    const jpg = new File([new Uint8Array([2])], 'IMG_1.jpg', { type: 'image/jpeg' });
    await act(async () => { finish(jpg); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark done' })).toBeEnabled());
    expect(state.files).toEqual([jpg]);
  });

  it('a conversion that finishes after the dialog closed is dropped', async () => {
    let finish!: (f: File | null) => void;
    media.toWebImage.mockImplementation(() => new Promise((r) => { finish = r; }));
    const { onFilesChange, view } = setup();
    paste([new File([new Uint8Array([1])], 'IMG_2.HEIC', { type: 'image/heic' })]);
    await screen.findByRole('status', { name: 'Preparing photo' });
    view.unmount();
    await act(async () => { finish(png('late.png')); });
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('a photo no browser can show is refused with a message', async () => {
    media.toWebImage.mockResolvedValue(null);
    const { state } = setup();
    paste([new File([new Uint8Array([1])], 'IMG_3.HEIC', { type: 'image/heic' })]);
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith(expect.stringMatching(/can't show/), 'error'));
    expect(state.files).toEqual([]);
  });
});
