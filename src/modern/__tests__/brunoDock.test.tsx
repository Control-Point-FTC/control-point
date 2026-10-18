import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn() }));
vi.mock('../../services/aiService', async (orig) => ({ ...(await orig<object>()), ...ai }));
const dlg = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dlg }));

import { InterfaceModeProvider } from '../interfaceMode';
import { BrunoDock, BRUNO_TIPS } from '../BrunoDock';
import BrunoPanel from '../../components/BrunoPanel';
import { clearDrafts, inEpoch } from '../drafts';
import { BRUNO_OPEN_EVENT } from '../../services/brunoContext';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const me = { id: 7, name: 'Ada', role: 'Builder', team_id: 1, interface_mode: 'modern', bruno_output_level: 'medium' };

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: any) => {
    if (url === '/api/bruno/chats' && init?.method === 'POST') return json({ id: 55 });
    if (url === '/api/profile') return json({ user: { ...me, bruno_output_level: 'high' } });
    return json({});
  });
  ai.streamBuildHelper.mockReset();
  clearDrafts();
});

const props = (over: any = {}) => ({ open: true, onClose: vi.fn(), onExpand: vi.fn(), currentUser: me, botName: 'Bruno', onActiveChatId: vi.fn(), onUserSaved: vi.fn(), ...over });
const wrap = (el: React.ReactNode) => (
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter>{el}</MemoryRouter></InterfaceModeProvider>
);

describe('Modern Bruno dock', () => {
  it('sends in a fresh chat and shows the streamed reply', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('Try a 2-stage intake.'); });
    const p = props();
    render(wrap(<BrunoDock {...p} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'Intake ideas?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Try a 2-stage intake.')).toBeInTheDocument());
    expect(ai.streamBuildHelper.mock.calls[0][2]).toBe(55);
    expect(p.onActiveChatId).toHaveBeenLastCalledWith(55);
  });

  it('keeps the conversation when the interface switches to Legacy', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('Use a gecko wheel.'); });
    const first = render(wrap(<BrunoDock {...props()} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'Intake wheel?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Use a gecko wheel.')).toBeInTheDocument());
    first.unmount();
    render(wrap(<BrunoPanel {...props()} />));
    expect(screen.getByText('Intake wheel?')).toBeInTheDocument();
    expect(screen.getByText('Use a gecko wheel.')).toBeInTheDocument();
  });

  it('Stop keeps the partial reply', async () => {
    ai.streamBuildHelper.mockImplementation((_m: any, onChunk: (c: string) => void, _id: any, opts: any) => new Promise((_r, rej) => {
      onChunk('Half of it');
      opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })));
    }));
    render(wrap(<BrunoDock {...props()} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'Long answer please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generating' }));
    await waitFor(() => expect(screen.getByText('Stopped.')).toBeInTheDocument());
    expect(screen.getByText(/Half of it/)).toBeInTheDocument();
  });

  it('changes answer length with the same profile PATCH', async () => {
    const p = props();
    render(wrap(<BrunoDock {...p} />));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Bruno output length' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /High/ }));
    await waitFor(() => expect(p.onUserSaved).toHaveBeenCalled());
    expect(JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/profile')![1].body)).toEqual({ name: 'Ada', role: 'Builder', bruno_output_level: 'high' });
  });

  it('sends a queued "Scout with Bruno" prompt, and Escape closes', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('Team 123 fits.'); });
    const p = props();
    render(wrap(<BrunoDock {...p} />));
    act(() => { window.dispatchEvent(new CustomEvent(BRUNO_OPEN_EVENT, { detail: { prompt: 'Who should we pick?' } })); });
    await waitFor(() => expect(screen.getByText('Team 123 fits.')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalled();
  });

  it('a reply still running at sign-out never writes the old conversation back', async () => {
    let finish: () => void = () => {};
    ai.streamBuildHelper.mockImplementation((_m: any, onChunk: (c: string) => void) => new Promise<void>((res) => {
      finish = () => { onChunk('secret answer'); res(); };
    }));
    render(wrap(<BrunoDock {...props()} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'private question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(ai.streamBuildHelper).toHaveBeenCalled());
    act(() => clearDrafts()); // sign-out / workspace switch
    await act(async () => { finish(); });
    expect(screen.queryByText('private question')).not.toBeInTheDocument();
    expect(screen.queryByText('secret answer')).not.toBeInTheDocument();
  });

  it('Stop works while the chat is still being created', async () => {
    let createChat: () => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/bruno/chats' && init?.method === 'POST'
      ? new Promise((res) => { createChat = () => res({ ok: true, json: async () => ({ id: 55 }) }); })
      : json({})));
    render(wrap(<BrunoDock {...props()} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'Quick one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generating' }));
    await act(async () => { createChat(); });
    await waitFor(() => expect(screen.getByText('Stopped.')).toBeInTheDocument());
    expect(ai.streamBuildHelper).not.toHaveBeenCalled();
  });

  it('keeps attachments and a queued scouting prompt across a mode switch', async () => {
    let finish: () => void = () => {};
    ai.streamBuildHelper.mockImplementation((_m: any, onChunk: (c: string) => void) => new Promise<void>((res) => { finish = () => { onChunk('ok'); res(); }; }));
    const first = render(wrap(<BrunoDock {...props()} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(ai.streamBuildHelper).toHaveBeenCalledTimes(1));
    // Queued while busy, then the interface switches.
    act(() => { window.dispatchEvent(new CustomEvent(BRUNO_OPEN_EVENT, { detail: { prompt: 'Queued scouting question' } })); });
    first.unmount();
    render(wrap(<BrunoPanel {...props()} />));
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('second reply'); });
    await act(async () => { finish(); });
    await waitFor(() => expect(ai.streamBuildHelper).toHaveBeenCalledTimes(2));
    expect(ai.streamBuildHelper.mock.calls[1][0].at(-1)).toMatchObject({ role: 'user', text: 'Queued scouting question' });
  });

  it('file reads that finish after sign-out are dropped (inEpoch)', () => {
    const seen: number[] = [];
    const late = inEpoch((n: number) => seen.push(n));
    const fresh = () => inEpoch((n: number) => seen.push(n));
    clearDrafts();
    late(1);
    fresh()(2);
    expect(seen).toEqual([2]);
  });
});


describe('Bruno dock layout (UX-13)', () => {
  it('welcomes by name and keeps the capability statement and Try one prompts', async () => {
    render(wrap(<BrunoDock {...props()} />));
    expect(screen.getByRole('heading', { name: 'Hi Ada.' })).toBeInTheDocument();
    expect(screen.getByText('Try one')).toBeInTheDocument();
    const starters = screen.getAllByRole('button').filter((b) => b.closest('ul') && !b.getAttribute('aria-label'));
    expect(starters.length).toBeGreaterThanOrEqual(3);
    // No second toolbar row: answer length lives in the composer, Resources in the header.
    expect(screen.getByRole('button', { name: 'Bruno output length' }).closest('form')).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resources' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('FTC resources')).toBeInTheDocument();
  });

  it('shows a tip that rotates while open', () => {
    vi.useFakeTimers();
    try {
      render(wrap(<BrunoDock {...props()} />));
      expect(screen.getByText(BRUNO_TIPS[0])).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(9000); });
      expect(screen.getByText(BRUNO_TIPS[1])).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Bruno dock and the corner', () => {
  it('reserves the right edge while open so the bug button moves left of it', () => {
    const r = render(wrap(<BrunoDock {...props()} />));
    expect(document.documentElement.style.getPropertyValue('--cp-side-dock')).toBe('400px');
    r.rerender(wrap(<BrunoDock {...props({ open: false })} />));
    expect(document.documentElement.style.getPropertyValue('--cp-side-dock')).toBe('');
  });

  it('Recent chats lists past conversations and opens one in the panel', async () => {
    const now = new Date().toISOString();
    api.apiFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/bruno/chats?')) return json([{ id: 9, title: 'Intake wheel choice', updated_at: now }, { id: 8, title: null, updated_at: now }]);
      if (url === '/api/bruno/chats/9') return json({ messages: [{ role: 'user', text: 'Which intake wheel?' }, { role: 'model', text: 'Go with compliant wheels.' }] });
      return json({});
    });
    const p = props();
    render(wrap(<BrunoDock {...p} />));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Recent chats' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Intake wheel choice/ }));
    await waitFor(() => expect(screen.getByText('Go with compliant wheels.')).toBeInTheDocument());
    expect(screen.getByText('Which intake wheel?')).toBeInTheDocument();
    expect(p.onActiveChatId).toHaveBeenLastCalledWith(9);
  });

  it('a slow chat load never replaces a newer choice, and a failed one says so', async () => {
    const now = new Date().toISOString();
    let release!: () => void;
    api.apiFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/bruno/chats?')) return json([{ id: 9, title: 'Intake wheel choice', updated_at: now }, { id: 8, title: 'Broken chat', updated_at: now }]);
      if (url === '/api/bruno/chats/9') return new Promise((r) => { release = () => r({ ok: true, json: async () => ({ messages: [{ role: 'model', text: 'Go with compliant wheels.' }] }) }); });
      if (url === '/api/bruno/chats/8') return json({}, false);
      return json({});
    });
    const p = props();
    render(wrap(<BrunoDock {...p} />));
    const openMenu = () => fireEvent.pointerDown(screen.getByRole('button', { name: 'Recent chats' }), { button: 0, ctrlKey: false });
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Intake wheel choice/ }));
    // New chat while chat 9 is still loading: it stays a new chat.
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await act(async () => { release(); await Promise.resolve(); });
    expect(screen.queryByText('Go with compliant wheels.')).not.toBeInTheDocument();
    // A chat that fails to load raises a visible message (the menu has closed).
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Broken chat/ }));
    await waitFor(() => expect(dlg.notify).toHaveBeenCalledWith(expect.stringMatching(/Couldn't open that chat/), 'error'));
  });

  it('Auto-apply: a reply that just finished applies its changes; a reopened chat never does', async () => {
    const applied: string[] = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/bruno/chats' && init?.method === 'POST') return json({ id: 55 });
      if (url === '/api/ai/apply-actions') { applied.push(init.body); return json({ ok: true, applied: { event: 1 }, created: { event: [9] } }); }
      if (url.startsWith('/api/bruno/chats?')) return json([{ id: 9, title: 'Old chat', updated_at: new Date().toISOString() }]);
      if (url === '/api/bruno/chats/9') return json({ messages: [{ role: 'user', text: 'old' }, { role: 'model', text: 'Old\n```event\n[{"title":"Old event","date":"2026-11-01"}]\n```' }] });
      return json({});
    });
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('Adding it.\n```event\n[{"title":"Build night","date":"2026-11-02"}]\n```'); });
    render(wrap(<BrunoDock {...props()} />));
    fireEvent.click(screen.getByRole('switch', { name: /Auto-apply/ }));
    expect(screen.getByRole('switch', { name: /Auto-apply/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'Add build night' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toContain('Build night');
    // Reopening an older chat shows its card but applies nothing.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Recent chats' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Old chat/ }));
    await screen.findByText(/Old event/);
    await new Promise((r) => setTimeout(r, 30));
    expect(applied).toHaveLength(1);
    fireEvent.click(screen.getByRole('switch', { name: /Auto-apply/ }));
  });

  it('Auto-apply turned on after a reply finished never applies that reply', async () => {
    const applied: string[] = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/bruno/chats' && init?.method === 'POST') return json({ id: 56 });
      if (url === '/api/ai/apply-actions') { applied.push(init.body); return json({ ok: true, applied: { event: 1 }, created: { event: [9] } }); }
      return json({});
    });
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('Adding it.\n```event\n[{"title":"Late night","date":"2026-11-03"}]\n```'); });
    render(wrap(<BrunoDock {...props()} />));
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'Add late night' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/Late night/);
    fireEvent.click(screen.getByRole('switch', { name: /Auto-apply/ }));
    await new Promise((r) => setTimeout(r, 30));
    expect(applied).toHaveLength(0);
    fireEvent.click(screen.getByRole('switch', { name: /Auto-apply/ }));
  });
});
