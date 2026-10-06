import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn(), applyActionProposals: vi.fn(), notifyBrunoDataChanged: vi.fn() }));
vi.mock('../../services/aiService', async (orig) => ({ ...(await orig<object>()), ...ai }));
const dialog = vi.hoisted(() => ({ confirmDialog: vi.fn(), notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { BrunoPage } from '../pages/bruno/BrunoPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollTo ??= function () {} as any;

const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
// Like the real server, the mock stores each chat's history as replies finish,
// so a reload of the chat returns the same conversation whatever the timing.
let history: Record<number, any[]> = {};
const replyWith = (...chunks: string[]) => async (msgs: any[], onChunk: (c: string) => void, chatId: number) => {
  for (const c of chunks) onChunk(c);
  history[chatId] = [...msgs.map((m) => ({ role: m.role, text: m.text })), { role: 'model', text: chunks.join('') }];
};
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const CHATS = [
  { id: 11, title: 'Lift PID', member_id: 7, is_public: 0, updated_at: '2026-10-01 10:00:00' },
  { id: 12, title: 'Team strategy', member_id: 8, owner_name: 'Grace', is_public: 1, updated_at: '2026-10-01 09:00:00' },
];
let chats: any[] = [];

afterEach(cleanup);
beforeEach(() => {
  chats = [];
  history = {};
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: any) => {
    if (url.startsWith('/api/bruno/chats?')) return json(chats);
    if (url === '/api/bruno/chats' && init?.method === 'POST') { chats = [{ id: 99, title: 'New', member_id: 7, is_public: 0 }]; return json({ id: 99 }); }
    if (/^\/api\/bruno\/chats\/\d+$/.test(url) && !init) {
      const id = Number(url.split('/').pop());
      return json({ messages: history[id] ?? [{ role: 'user', text: 'How do I tune PID?' }, { role: 'model', text: 'Start with P.' }] });
    }
    return json({});
  });
  ai.streamBuildHelper.mockReset();
  ai.applyActionProposals.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});

function setup(admin = false) {
  return render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={['/bruno']}><BrunoPage currentUser={me} hasScope={(s: string) => admin && s === 'admin'} botName="Bruno" /></MemoryRouter>
    </InterfaceModeProvider>,
  );
}

describe('Modern Bruno', () => {
  it('starts a chat, streams the reply, and shows it', async () => {
    ai.streamBuildHelper.mockImplementation(replyWith('Use encoders', ' with RUN_TO_POSITION.'));
    setup();
    expect(await screen.findByText('What are we working on?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message Bruno'), { target: { value: 'How do encoders work?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/bruno/chats', expect.objectContaining({ method: 'POST' })));
    // The live bubble is replaced by the final row, so assert on the settled DOM.
    await waitFor(() => expect(screen.getByText('Use encoders with RUN_TO_POSITION.')).toBeInTheDocument());
    const [msgs, , chatId] = ai.streamBuildHelper.mock.calls[0];
    expect(chatId).toBe(99);
    expect(msgs.at(-1)).toMatchObject({ role: 'user', text: 'How do encoders work?' });
  });

  it('Stop aborts the reply and keeps the partial text', async () => {
    ai.streamBuildHelper.mockImplementation((_m: any, onChunk: (c: string) => void, _id: any, opts: any) => new Promise((_res, rej) => {
      onChunk('Partial answer');
      opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    setup();
    fireEvent.change(await screen.findByLabelText('Message Bruno'), { target: { value: 'Explain odometry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generating' }));
    await waitFor(() => expect(screen.getByText('Stopped.')).toBeInTheDocument());
    expect(screen.getByText(/Partial answer/)).toBeInTheDocument();
    expect(screen.getByText('Stopped.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('a half-typed message survives a remount (mode switch)', async () => {
    const first = setup();
    fireEvent.change(await screen.findByLabelText('Message Bruno'), { target: { value: 'Draft question' } });
    first.unmount();
    setup();
    expect(((await screen.findByLabelText('Message Bruno')) as HTMLTextAreaElement).value).toBe('Draft question');
  });

  it('confirms an action proposal through apply-actions', async () => {
    ai.streamBuildHelper.mockImplementation(replyWith('Sure.\n```tasks\n[{"title":"Order REV parts"}]\n```'));
    ai.applyActionProposals.mockResolvedValue({ task: 1 });
    setup();
    fireEvent.change(await screen.findByLabelText('Message Bruno'), { target: { value: 'Add a task to order REV parts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add all 1' }));
    await waitFor(() => expect(ai.applyActionProposals).toHaveBeenCalled());
    expect(await screen.findByText(/Added 1 item/)).toBeInTheDocument();
    expect(ai.notifyBrunoDataChanged).toHaveBeenCalledWith(['task']);
  });

  it('owners can rename, share and delete; others only read', async () => {
    chats = CHATS;
    setup();
    expect(await screen.findByText('Start with P.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Share with the team' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/bruno/chats/11', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_public: true }) })));
    fireEvent.click(screen.getAllByRole('button', { name: /Team strategy/ })[0]);
    await waitFor(() => expect(screen.queryByRole('switch', { name: 'Share with the team' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Chat options' })).not.toBeInTheDocument();
  });

  it('a finished reply keeps its "Thought for Ns"', async () => {
    ai.streamBuildHelper.mockImplementation(async (msgs: any[], onChunk: (c: string) => void, chatId: number) => {
      await new Promise((r) => setTimeout(r, 600));
      onChunk('Here you go.');
      history[chatId] = [...msgs.map((m: any) => ({ role: m.role, text: m.text })), { role: 'model', text: 'Here you go.' }];
    });
    setup();
    fireEvent.change(await screen.findByLabelText('Message Bruno'), { target: { value: 'Think hard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Here you go.')).toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText(/Thought for/)).toBeInTheDocument());
  });

  it('switching chats cancels a rename so it can never hit the other chat', async () => {
    chats = [CHATS[0], { ...CHATS[0], id: 13, title: 'Second chat' }];
    setup();
    await screen.findByText('Start with P.');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Chat options' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
    fireEvent.change(screen.getByLabelText('Chat title'), { target: { value: 'Renamed A' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Second chat/ })[0]);
    await waitFor(() => expect(screen.queryByLabelText('Chat title')).not.toBeInTheDocument());
    expect(api.apiFetch.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
  });

  it('a rejected request does not claim any thinking', async () => {
    ai.streamBuildHelper.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 600));
      throw Object.assign(new Error('nope'), { serverError: 'AI not configured' });
    });
    setup();
    fireEvent.change(await screen.findByLabelText('Message Bruno'), { target: { value: 'Hello?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('AI not configured')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.queryByText(/Thought for/)).not.toBeInTheDocument();
  });
});

