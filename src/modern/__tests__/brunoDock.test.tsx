import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn() }));
vi.mock('../../services/aiService', async (orig) => ({ ...(await orig<object>()), ...ai }));

import { InterfaceModeProvider } from '../interfaceMode';
import { BrunoDock } from '../BrunoDock';
import BrunoPanel from '../../components/BrunoPanel';
import { clearDrafts } from '../drafts';
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
});
