import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StickyNotes, type StickyNote } from '../StickyNotes';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const confirm = vi.hoisted(() => ({ result: true }));
vi.mock('../../components/dialog', () => ({ confirmDialog: vi.fn(async () => confirm.result) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); confirm.result = true; });

const note = (over: Partial<StickyNote> = {}): StickyNote => ({ id: 1, body: 'Buy zip ties', color: 'volt', x: 100, y: 100, width: 260, height: 220, open: true, updatedAt: '2026-10-10T12:00:00Z', ...over });

describe('Sticky notes', () => {
  it('lists your notes and opens a new one ready to type', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => init?.method === 'POST' ? note({ id: 2, body: '' }) as any : [note({ open: false })] as any);
    render(<StickyNotes open onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Buy zip ties/ })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /Sticky note/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /New note/ }));
    const card = await screen.findByRole('dialog', { name: 'Sticky note: Empty note' });
    expect(card.querySelector('textarea')).toBe(document.activeElement);
  });

  it('saves typing after a pause and shows honest save states', async () => {
    let fail = true;
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') { if (fail) throw new Error('offline'); return { ...note(), ...JSON.parse(init.body) } as any; }
      return [note()] as any;
    });
    render(<StickyNotes open onClose={vi.fn()} />);
    const text = await screen.findByRole('textbox', { name: 'Note text' });
    fireEvent.change(text, { target: { value: 'Buy zip ties and bolts' } });
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(await screen.findByText('Not saved', {}, { timeout: 2000 })).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Not saved')).toBeNull());
    const patch = vi.mocked(apiJson).mock.calls.filter(([, i]) => (i as any)?.method === 'PATCH').at(-1)!;
    expect(JSON.parse(String((patch[1] as any).body))).toEqual({ body: 'Buy zip ties and bolts' });
  });

  it('nudges with the keyboard, recolors, closes and deletes after confirming', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => init?.method === 'PATCH' ? { ...note(), ...JSON.parse(init.body) } as any : init?.method === 'DELETE' ? { ok: true } as any : [note()] as any);
    render(<StickyNotes open onClose={vi.fn()} />);
    const handle = await screen.findByRole('button', { name: 'Move note (arrow keys)' }).catch(() => screen.getByLabelText('Move note (arrow keys)'));
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.some(([, i]) => (i as any)?.body === JSON.stringify({ x: 110, y: 100 }))).toBe(true));
    fireEvent.change(screen.getByRole('combobox', { name: 'Note color' }), { target: { value: 'mint' } });
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Sticky note/ }).getAttribute('data-color')).toBe('mint'));
    confirm.result = false;
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: /Sticky note/ })).toBeTruthy();
    confirm.result = true;
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Sticky note/ })).toBeNull());
    expect(screen.getByText('No sticky notes yet.')).toBeTruthy();
  });
});
