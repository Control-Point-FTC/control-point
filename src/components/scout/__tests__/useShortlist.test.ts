import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ShortlistEntry } from '../../../types/ftcScout';

const api = vi.hoisted(() => ({
  fetchShortlist: vi.fn(),
  saveShortlistPatch: vi.fn(),
  removeShortlistEntry: vi.fn(),
}));
vi.mock('../../../services/ftcScoutApi', () => api);

import { useShortlist } from '../useShortlist';

const entry = (n: number, over: Partial<ShortlistEntry> = {}): ShortlistEntry => ({
  teamNumber: n, teamName: `T${n}`, season: 2025, eventCode: null, notes: '', priority: 'medium', scoutNext: false, strengths: [], weaknesses: [], updatedAt: '', ...over,
});

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});

describe('useShortlist', () => {
  it('serializes writes and keeps still-pending edits on top of each server snapshot', async () => {
    api.fetchShortlist.mockResolvedValue([entry(1), entry(2)]);
    const first = deferred<ShortlistEntry[]>();
    const second = deferred<ShortlistEntry[]>();
    api.saveShortlistPatch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useShortlist(2025));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => { result.current.patch({ teamNumber: 1, notes: 'fast auto' }); });
    act(() => { result.current.patch({ teamNumber: 2, priority: 'high' }); });
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.saveShortlistPatch).toHaveBeenCalledTimes(1); // second waits for the first

    // First response (server has edit 1 only): edit 2 must stay visible.
    await act(async () => { first.resolve([entry(1, { notes: 'fast auto' }), entry(2)]); });
    expect(result.current.entries.find((e) => e.teamNumber === 2)?.priority).toBe('high');
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenCalledTimes(2));

    await act(async () => { second.resolve([entry(1, { notes: 'fast auto' }), entry(2, { priority: 'high' })]); });
    expect(result.current.entries.map((e) => [e.notes, e.priority])).toEqual([['fast auto', 'medium'], ['', 'high']]);
  });

  it('rolls back and reports a failed write', async () => {
    api.fetchShortlist.mockResolvedValue([entry(1)]);
    api.removeShortlistEntry.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useShortlist(2025));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => { result.current.remove(1); });
    expect(result.current.entries).toHaveLength(0);
    await waitFor(() => expect(result.current.error).toMatch(/wasn't saved/));
    expect(result.current.entries.map((e) => e.teamNumber)).toEqual([1]);
  });

  it('ignores responses from a previous season', async () => {
    const late = deferred<ShortlistEntry[]>();
    api.fetchShortlist.mockImplementation(async (season: number) => (season === 2025 ? [entry(1)] : [entry(9, { season: 2024 })]));
    api.saveShortlistPatch.mockReturnValueOnce(late.promise);
    const { result, rerender } = renderHook(({ s }) => useShortlist(s), { initialProps: { s: 2025 } });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => { result.current.patch({ teamNumber: 5 }); });
    rerender({ s: 2024 });
    await waitFor(() => expect(result.current.entries.map((e) => e.teamNumber)).toEqual([9]));
    await act(async () => { late.resolve([entry(1), entry(5)]); });
    expect(result.current.entries.map((e) => e.teamNumber)).toEqual([9]);
  });
});
