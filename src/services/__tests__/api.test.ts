import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiJson, apiGet, ApiError, noteSignIn } from '../api';

const fetchMock = vi.fn();

function jsonRes(status: number, body: any) {
  const res: any = { ok: status >= 200 && status < 300, status, json: async () => body };
  res.clone = () => jsonRes(status, body);
  return res;
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
    localStorage.setItem('cp-session-tag', 'tag-1');
    noteSignIn('tag-1');
    localStorage.setItem('sessionId', 'stale');
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('cp:unauthorized', listener);
    fetchMock.mockResolvedValue(jsonRes(401, { error: 'Not signed in' }));
    const err = await apiJson('/api/x').catch((e) => e);
    window.removeEventListener('cp:unauthorized', listener);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('Session expired — please sign in again');
    expect(localStorage.getItem('sessionId')).toBeNull();
    expect(events).toEqual(['cp:unauthorized']);
  });

  it('a 401 that is not about the session (wrong current password) keeps you signed in', async () => {
    localStorage.setItem('cp-session-tag', 'tag-1');
    noteSignIn('tag-1');
    localStorage.setItem('sessionId', 'live');
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('cp:unauthorized', listener);
    fetchMock.mockResolvedValue(jsonRes(401, { error: 'Current password is incorrect' }));
    const err = await apiJson('/api/auth/change-password').catch((e) => e);
    window.removeEventListener('cp:unauthorized', listener);
    expect(err.message).toBe('Current password is incorrect');
    expect(localStorage.getItem('sessionId')).toBe('live');
    expect(events).toEqual([]);
  });
});

describe('apiFetch', () => {
  it('an expired session on any call returns the app to sign-in (once)', async () => {
    localStorage.setItem('cp-session-tag', 'tag-1');
    noteSignIn('tag-1');
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('cp:unauthorized', listener);
    // A real Response: its body can be read only once, so the check must use a clone.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const res = await apiFetch('/api/tasks', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not signed in' });
    expect(events).toEqual(['cp:unauthorized']);
    expect(localStorage.getItem('cp-session-tag')).toBeNull();
    // A second stale 401 for the same ended sign-in doesn't fire again.
    await apiFetch('/api/presence', { method: 'POST', body: '{}' });
    window.removeEventListener('cp:unauthorized', listener);
    expect(events).toEqual(['cp:unauthorized']);
  });

  it("another tab clearing the shared marker doesn't hide this tab's own expiry", async () => {
    noteSignIn('this-tab');
    localStorage.removeItem('cp-session-tag'); // another tab signed out
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('cp:unauthorized', listener);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 }));
    await apiFetch('/api/tasks');
    window.removeEventListener('cp:unauthorized', listener);
    expect(events).toEqual(['cp:unauthorized']);
  });

  it("a late 401 from an earlier sign-in doesn't end a newer one", async () => {
    localStorage.setItem('cp-session-tag', 'old-sign-in');
    noteSignIn('old-sign-in');
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('cp:unauthorized', listener);
    let answer!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { answer = r; }));
    const pending = apiFetch('/api/presence', { method: 'POST', body: '{}' });
    // Meanwhile the user signs in again.
    localStorage.setItem('cp-session-tag', 'new-sign-in');
    noteSignIn('new-sign-in');
    answer(new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 }));
    await pending;
    window.removeEventListener('cp:unauthorized', listener);
    expect(events).toEqual([]);
    expect(localStorage.getItem('cp-session-tag')).toBe('new-sign-in');
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
