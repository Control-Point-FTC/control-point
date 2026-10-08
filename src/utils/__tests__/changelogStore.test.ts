import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', () => api);

describe('changelog store', () => {
  beforeEach(() => { vi.resetModules(); api.apiFetch.mockReset(); });

  it('a failed load is retried on the next call', async () => {
    const store = await import('../changelogStore');
    api.apiFetch.mockRejectedValueOnce(new Error('offline'));
    await store.loadChangelog();
    expect(store.latestVersion()).not.toBe('');
    api.apiFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ version: '9.0.0', date: '2026-10-09', title: 'Big', added: ['x'], improved: [], fixed: [] }] });
    await store.loadChangelog();
    expect(store.latestVersion()).toBe('9.0.0');
    expect(api.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('an empty list from the server is accepted (the owner deleted everything)', async () => {
    const store = await import('../changelogStore');
    api.apiFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await store.loadChangelog();
    expect(store.getChangelog()).toEqual([]);
  });
});
