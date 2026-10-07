import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiJson, apiGet, ApiError } from '../api';

const fetchMock = vi.fn();

function jsonRes(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as any;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('apiFetch', () => {
  it('never puts a session token in the URL or a header — the HttpOnly cookie carries it', async () => {
    localStorage.setItem('sessionId', 'abc123'); // a pre-cookie leftover must not be sent
    fetchMock.mockResolvedValue(jsonRes(200, {}));
    await apiFetch('/api/teams');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/teams'); // no ?sessionId= appended
    expect(init.headers.get('X-Session-ID')).toBeNull();
    expect(init.credentials).toBe('same-origin');
  });

  it('sends the CSRF client header and preserves caller headers', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, {}));
    await apiFetch('/api/x', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get('X-CP-Client')).toBe('1');
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('apiJson', () => {
  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { hello: 'world' }));
    await expect(apiJson('/api/x')).resolves.toEqual({ hello: 'world' });
  });

  it('throws ApiError with the server message on failure', async () => {
    fetchMock.mockResolvedValue(jsonRes(400, { error: 'Bad things' }));
    const err = await apiJson('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad things');
  });

  it('on 401 clears the session and dispatches cp:unauthorized', async () => {
    localStorage.setItem('sessionId', 'stale');
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('cp:unauthorized', listener);
    fetchMock.mockResolvedValue(jsonRes(401, { error: 'nope' }));
    const err = await apiJson('/api/x').catch((e) => e);
    window.removeEventListener('cp:unauthorized', listener);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(localStorage.getItem('sessionId')).toBeNull();
    expect(events).toEqual(['cp:unauthorized']);
  });
});

describe('apiGet', () => {
  it('retries on 500 and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(500, { error: 'x' }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    await expect(apiGet('/api/x', { retries: 2 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10000);

  it('does not retry client errors', async () => {
    fetchMock.mockResolvedValue(jsonRes(400, { error: 'bad' }));
    await expect(apiGet('/api/x', { retries: 3 })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries', async () => {
    fetchMock.mockResolvedValue(jsonRes(503, { error: 'down' }));
    await expect(apiGet('/api/x', { retries: 1 })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10000);
});
