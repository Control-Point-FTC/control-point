import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiFetch } from './api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', (...args: any[]) => fetchMock(...args));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  try {
    localStorage.removeItem('sessionId');
  } catch {
    /* ignore */
  }
});

function lastHeaders(): Headers {
  const init = fetchMock.mock.calls[0]?.[1] || {};
  return init.headers as Headers;
}

describe('apiFetch content-type default', () => {
  it('sets application/json for string bodies without an explicit content type', async () => {
    await apiFetch('/api/outreach/social/youtube', {
      method: 'POST',
      body: JSON.stringify({ input: '@FTCGeneral4215' }),
    });
    expect(lastHeaders().get('Content-Type')).toBe('application/json');
  });

  it('does not override an explicit content type', async () => {
    await apiFetch('/x', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    expect(lastHeaders().get('Content-Type')).toBe('text/plain');
  });

  it('leaves FormData bodies alone so fetch sets multipart itself', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'x.txt');
    await apiFetch('/api/messages/upload', { method: 'POST', body: fd });
    expect(lastHeaders().has('Content-Type')).toBe(false);
  });

  it('does not add a content type when there is no body', async () => {
    await apiFetch('/api/outreach/social/1/sync', { method: 'POST' });
    expect(lastHeaders().has('Content-Type')).toBe(false);
  });
});
