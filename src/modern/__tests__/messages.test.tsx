import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useRef, useState } from 'react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const voice = vi.hoisted(() => ({ startCall: vi.fn() }));
vi.mock('../../voice/VoiceContext', () => ({ useVoice: () => voice }));
vi.mock('../pages/messages/VoiceChannels', () => ({ VoiceChannels: () => <div>voice-channels</div> }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { MessagesPage } from '../pages/messages/MessagesPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollIntoView ??= function () {};
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern', presence: 'online' };
const grace = { id: 8, name: 'Grace Hopper', team_id: 1, presence: 'offline' };
const CHANNELS = [
  { id: 1, name: 'general', topic: 'Team chat' },
  { id: 2, name: 'announcements', post_restricted: 1 },
];
const t0 = new Date('2026-10-01T10:00:00Z').toISOString();
const MSGS = [
  { id: 100, sender_id: 8, sender_name: 'Grace Hopper', content: 'Ship it', channel_id: 1, timestamp: t0 },
  { id: 101, sender_id: 7, sender_name: 'Ada', content: 'Done', channel_id: 1, timestamp: t0 },
];

let socket: { send: ReturnType<typeof vi.fn> };
afterEach(cleanup);
beforeEach(() => {
  socket = { send: vi.fn() };
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json({}));
  dialog.notify.mockReset();
  clearDrafts();
});

function Harness({ admin = false, channel = 1, msgs = MSGS, cats = [], createCategory = vi.fn() }: { admin?: boolean; channel?: number; msgs?: any[]; cats?: any[]; createCategory?: any }) {
  const [messages, setMessages] = useState<any[]>(msgs);
  const [channels, setChannels] = useState<any[]>(CHANNELS);
  const [activeChannelId, setActiveChannelId] = useState<number>(channel);
  const msgCache = useRef(new Map());
  const msgExhausted = useRef(new Map());
  return (
    <MessagesPage
      messages={messages} setMessages={setMessages} msgCache={msgCache} msgExhausted={msgExhausted}
      members={[me, grace]} currentUser={me} socket={socket} channels={channels} setChannels={setChannels}
      activeChannelId={activeChannelId} setActiveChannelId={setActiveChannelId} isAdmin={admin}
      teams={[{ id: 1, name: 'Robo' }]} activeTeamName="Robo" chatCategories={cats}
      handleCreateChannel={vi.fn()} handleDeleteChannel={vi.fn()} handleCreateCategory={createCategory} handleRenameCategory={vi.fn()}
      handleDeleteCategory={vi.fn()} handleMoveChannel={vi.fn()} memberMenuItems={() => []}
    />
  );
}
const setup = (p: any = {}) => render(
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
    <MemoryRouter><Harness {...p} /></MemoryRouter>
  </InterfaceModeProvider>,
);
const sent = () => socket.send.mock.calls.map((c) => JSON.parse(c[0]));

describe('Modern Messages', () => {
  it('sends over the socket like Legacy and shows the message instantly', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Message #general'), { target: { value: 'Hello team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(sent()[0]).toMatchObject({ type: 'chat', sender_id: 7, sender_name: 'Ada', content: 'Hello team', channel_id: 1, reply_to_id: null });
    expect(sent()[0].client_id).toMatch(/^c-/);
    expect(screen.getByText('Hello team')).toBeInTheDocument();
  });

  it('suggests mentions, inserts with Tab and converts to @[Name]', () => {
    setup();
    const box = screen.getByLabelText('Message #general');
    fireEvent.change(box, { target: { value: 'hey @Gra' } });
    expect(screen.getByRole('option', { name: /Grace Hopper/ })).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Tab' });
    expect((box as HTMLTextAreaElement).value).toBe('hey @Grace Hopper ');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent()[0].content).toBe('hey @[Grace Hopper] ');
  });

  it('replies and forwards', async () => {
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
    expect(screen.getByText(/Replying to/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message #general'), { target: { value: 'Agreed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(sent()[0]).toMatchObject({ content: 'Agreed', reply_to_id: 100 });

    fireEvent.click(screen.getAllByRole('button', { name: 'Forward' })[0]);
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('option', { name: /announcements/ }));
    expect(sent()[1]).toMatchObject({ type: 'chat', channel_id: 2, is_forwarded: 1, forwarded_from: 'Grace Hopper · #general', content: 'Ship it' });
  });

  it('members can delete only their own messages (optimistic DELETE)', async () => {
    setup();
    expect(screen.getAllByRole('button', { name: 'Delete message' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete message' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/messages/101', { method: 'DELETE' }));
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });

  it('admin-only channels block members from posting', () => {
    setup({ channel: 2, msgs: [] });
    expect(screen.getByText(/Only admins can post/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Message #announcements')).not.toBeInTheDocument();
  });

  it('a half-typed message survives a remount (mode switch)', () => {
    const first = setup();
    fireEvent.change(screen.getByLabelText('Message #general'), { target: { value: 'unsent thought' } });
    first.unmount();
    setup();
    expect((screen.getByLabelText('Message #general') as HTMLTextAreaElement).value).toBe('unsent thought');
  });

  it('admins toggle admin-only posting with the Legacy PATCH', async () => {
    setup({ admin: true });
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Options for #general' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Admin-only posting/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/chat/channels/1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ post_restricted: 1 }) })));
  });

  it('loads older messages with the before= cursor', { timeout: 20000 }, async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i, sender_id: 8, sender_name: 'Grace Hopper', content: `m${i}`, channel_id: 1, timestamp: t0 }));
    api.apiFetch.mockImplementation((url: string) => json(url.includes('before=') ? [{ id: 5, sender_id: 8, sender_name: 'Grace Hopper', content: 'ancient', channel_id: 1, timestamp: t0 }] : {}));
    setup({ msgs: many });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load older messages' })); });
    expect(api.apiFetch).toHaveBeenCalledWith('/api/messages?channel_id=1&limit=100&before=1000');
    expect(await screen.findByText('ancient')).toBeInTheDocument();
  });

  it('mention suggestions work from the keyboard (click/Enter on an option)', () => {
    setup();
    const box = screen.getByLabelText('Message #general');
    fireEvent.change(box, { target: { value: '@Gra' } });
    fireEvent.click(screen.getByRole('option', { name: /Grace Hopper/ }));
    expect((box as HTMLTextAreaElement).value).toBe('@Grace Hopper ');
  });

  it('keeps the new-category form open when creation fails', async () => {
    setup({ admin: true, createCategory: vi.fn(async () => null) });
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'New channel or category' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /New category/ }));
    fireEvent.change(screen.getAllByLabelText('Category name')[0], { target: { value: 'Build' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    await waitFor(() => expect(screen.getAllByLabelText('Category name')[0]).toBeInTheDocument());
  });

  it('"New channel here" shows its form even on a collapsed category', async () => {
    localStorage.setItem('cp-collapsed-cats-1', JSON.stringify([9]));
    setup({ admin: true, cats: [{ id: 9, name: 'Build', position: 0 }] });
    expect(screen.getAllByRole('button', { name: /Build/ })[0]).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Options for Build' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /New channel here/ }));
    expect(screen.getAllByLabelText('Channel name')[0]).toBeInTheDocument();
    localStorage.removeItem('cp-collapsed-cats-1');
  });

  it('the composer shrinks back after its text is cleared', () => {
    setup();
    const box = screen.getByLabelText('Message #general') as HTMLTextAreaElement;
    Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => (box.value.length > 3 ? 120 : 36) });
    fireEvent.change(box, { target: { value: 'one\ntwo\nthree' } });
    expect(box.style.height).toBe('120px');
    fireEvent.change(box, { target: { value: '' } });
    expect(box.style.height).toBe('36px');
  });
});
