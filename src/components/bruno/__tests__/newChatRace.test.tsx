// V5 audit Low 14: "New chat" (or a first message) right after opening
// /bruno was undone when the chat list arrived, because the page then opened
// the latest chat. The latest chat opens only while nothing was chosen.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: api.apiFetch }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn(async () => {}) }));
vi.mock('../../../services/aiService', async (orig) => ({ ...(await orig<object>()), streamBuildHelper: ai.streamBuildHelper }));

import { useBrunoConversation } from '../useBrunoConversation';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const ok = (body: unknown) => ({ ok: true, json: async () => body });
const latest = [{ id: 133, title: 'NJ results', member_id: 7 }];

/** The chat list request is held until release() is called. */
function slowChatList() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  api.apiFetch.mockImplementation(async (url: string, init?: any) => {
    if (url.startsWith('/api/bruno/chats?')) { await gate; return ok(latest); }
    if (url === '/api/bruno/chats' && init?.method === 'POST') return ok({ id: 140 });
    if (url.startsWith('/api/bruno/chats/')) return ok({ messages: [{ role: 'user', text: 'old question' }] });
    return ok({});
  });
  return () => act(async () => { release(); });
}

beforeEach(() => { api.apiFetch.mockReset(); ai.streamBuildHelper.mockClear(); });

describe('opening /bruno', () => {
  it('opens the latest chat when nothing was chosen', async () => {
    const release = slowChatList();
    const { result } = renderHook(() => useBrunoConversation({ currentUser: { id: 7 } }), { wrapper });
    await release();
    await waitFor(() => expect(result.current.activeId).toBe(133));
  });

  it('a New chat clicked before the list arrives stays new', async () => {
    const release = slowChatList();
    const { result } = renderHook(() => useBrunoConversation({ currentUser: { id: 7 } }), { wrapper });
    act(() => result.current.newChat());
    await release();
    await waitFor(() => expect(result.current.chats).toHaveLength(1));
    expect(result.current.activeId).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it('a first message sent before the list arrives keeps its own chat', async () => {
    const release = slowChatList();
    const { result } = renderHook(() => useBrunoConversation({ currentUser: { id: 7 } }), { wrapper });
    await act(async () => { await result.current.send('What were the recent FTC event results in New Jersey?'); });
    await release();
    await waitFor(() => expect(result.current.chats).toHaveLength(1));
    expect(result.current.activeId).toBe(140);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', text: 'What were the recent FTC event results in New Jersey?' });
  });
});

describe('a chat created by sending', () => {
  it('loads normally when you come back to it later', async () => {
    const release = slowChatList();
    await release();
    const { result } = renderHook(() => useBrunoConversation({ currentUser: { id: 7 } }), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe(133));
    act(() => result.current.newChat());
    await act(async () => { await result.current.send('Plan our build season'); });
    expect(result.current.activeId).toBe(140);
    act(() => result.current.setActiveId(133));
    await waitFor(() => expect(result.current.messages[0]?.text).toBe('old question'));
    act(() => result.current.setActiveId(140));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/bruno/chats/140'));
  });
});
