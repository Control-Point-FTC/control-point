import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  fetchFtcTeam,
  invalidateFtcSeason,
  clearFtcCache,
  FtcNotConnectedError,
} from '../ftcCache';
import { useFtcTeam } from '../FtcStats';

const apiFetchMock = vi.fn();
vi.mock('../../services/api', () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
}));

const okRes = (body: any) => ({ ok: true, status: 200, json: async () => body });
const errRes = (status: number, body: any) => ({ ok: false, status, json: async () => body });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearFtcCache();
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchFtcTeam cache', () => {
  it('fetches once and serves the second call from cache', async () => {
    apiFetchMock.mockResolvedValueOnce(okRes({ team: { number: 123 } }));
    const first = await fetchFtcTeam(2025);
    const second = await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // same cached object
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('season=2025'),
      expect.anything(),
    );
  });

  it('refetches after the 10-minute TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    apiFetchMock.mockResolvedValue(okRes({ team: { number: 1 } }));
    await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-01T12:09:59Z'));
    await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // still cached

    vi.setSystemTime(new Date('2026-10-01T12:10:01Z'));
    await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // expired -> refetch
  });

  it('invalidateFtcSeason forces a refetch (explicit refresh path)', async () => {
    apiFetchMock.mockResolvedValue(okRes({ team: { number: 1 } }));
    await fetchFtcTeam(2025);
    invalidateFtcSeason(2025);
    await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('clearFtcCache drops every season', async () => {
    apiFetchMock.mockResolvedValue(okRes({ team: { number: 1 } }));
    await fetchFtcTeam(2024);
    await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    clearFtcCache();
    await fetchFtcTeam(2024);
    await fetchFtcTeam(2025);
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws FtcNotConnectedError on 404 and does not cache it', async () => {
    apiFetchMock.mockResolvedValue(errRes(404, { error: 'No FTC team connected' }));
    await expect(fetchFtcTeam(2025)).rejects.toBeInstanceOf(FtcNotConnectedError);
    // Not cached: a later call tries the network again (user may have connected).
    await expect(fetchFtcTeam(2025)).rejects.toBeInstanceOf(FtcNotConnectedError);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache server errors', async () => {
    apiFetchMock
      .mockResolvedValueOnce(errRes(500, { error: 'boom' }))
      .mockResolvedValueOnce(okRes({ team: { number: 7 } }));
    await expect(fetchFtcTeam(2025)).rejects.toThrow('boom');
    const data = await fetchFtcTeam(2025);
    expect(data).toEqual({ team: { number: 7 } });
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes the AbortSignal through to apiFetch', async () => {
    const controller = new AbortController();
    apiFetchMock.mockImplementation((_url: string, opts: any) => {
      expect(opts.signal).toBe(controller.signal);
      return Promise.resolve(okRes({ team: { number: 1 } }));
    });
    await fetchFtcTeam(2025, controller.signal);
  });
});

describe('useFtcTeam', () => {
  it('ignores a stale response when the season changes quickly', async () => {
    const d2025 = deferred<any>();
    const d2024 = deferred<any>();
    apiFetchMock.mockImplementation((url: string) =>
      url.includes('season=2025') ? d2025.promise : d2024.promise,
    );

    const { result } = renderHook(() => useFtcTeam());
    expect(result.current.loading).toBe(true);

    // Season flips to 2024 before the 2025 response arrives.
    act(() => result.current.setSeason(2024));
    // 2025 finally resolves late — must be ignored.
    await act(async () => {
      d2025.resolve(okRes({ team: { number: 2025 } }));
      await d2025.promise;
    });
    await act(async () => {
      d2024.resolve(okRes({ team: { number: 2024 } }));
      await d2024.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ team: { number: 2024 } });
    expect(result.current.error).toBeNull();
  });

  it('refresh() bypasses the cache', async () => {
    apiFetchMock.mockResolvedValue(okRes({ team: { number: 1 } }));
    const { result } = renderHook(() => useFtcTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    apiFetchMock.mockResolvedValue(okRes({ team: { number: 2 } }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ team: { number: 2 } });
  });

  it('maps a 404 to notConnected instead of error', async () => {
    apiFetchMock.mockResolvedValue(errRes(404, { error: 'No FTC team connected' }));
    const { result } = renderHook(() => useFtcTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notConnected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });
});
