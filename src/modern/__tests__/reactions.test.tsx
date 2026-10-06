import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { EmojiPicker, ReactionBar } from '../pages/messages/Reactions';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });

beforeEach(() => {
  api.apiFetch.mockReset();
  dialog.notify.mockReset();
});
afterEach(cleanup);

const reactions = [{ emoji: '👍', count: 1, reacted_by_me: false, member_ids: [8] }];

describe('Modern reaction bar', () => {
  it('toggles optimistically, then takes the server list', async () => {
    const server = [{ emoji: '👍', count: 2, reacted_by_me: true, member_ids: [8, 7] }];
    api.apiFetch.mockImplementation(() => json({ reactions: server }));
    const onChange = vi.fn();
    render(<ReactionBar messageId={5} reactions={reactions} memberId={7} onReactionsChange={onChange} memberNames={{ 8: 'Grace' }} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /1 👍 reactions/ }));
    expect(onChange).toHaveBeenNthCalledWith(1, 5, [{ emoji: '👍', count: 2, reacted_by_me: true, member_ids: [8, 7] }]);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(5, server));
    expect(api.apiFetch).toHaveBeenCalledWith('/api/messages/5/reactions', expect.objectContaining({ method: 'POST', body: JSON.stringify({ emoji: '👍' }) }));
  });

  it('rolls back and says so when the server refuses', async () => {
    api.apiFetch.mockImplementation(() => json({ error: 'nope' }, false));
    const onChange = vi.fn();
    render(<ReactionBar messageId={5} reactions={reactions} memberId={7} onReactionsChange={onChange} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /1 👍 reactions/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(5, reactions));
    expect(dialog.notify).toHaveBeenCalledWith('nope', 'error');
  });

  it('the + chip opens the picker; no reactions renders nothing', () => {
    const onAdd = vi.fn();
    const { container, rerender } = render(<ReactionBar messageId={5} reactions={reactions} memberId={7} onReactionsChange={vi.fn()} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a reaction' }));
    expect(onAdd).toHaveBeenCalled();
    rerender(<ReactionBar messageId={5} reactions={[]} memberId={7} onReactionsChange={vi.fn()} onAdd={onAdd} />);
    expect(container.textContent).toBe('');
  });
});

describe('Modern emoji picker', () => {
  it('quick picks, searches, switches category and offers your custom reactions', async () => {
    api.apiFetch.mockImplementation((url: string) => json(url === '/api/chat/custom-emoji' ? [{ id: 3, name: 'robo', image_url: '/uploads/robo.png' }] : []));
    const onPick = vi.fn();
    render(<EmojiPicker onPick={onPick} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'React 🔥' }));
    expect(onPick).toHaveBeenLastCalledWith('🔥');
    fireEvent.click(screen.getByRole('tab', { name: 'Hearts' }));
    expect(screen.getByRole('tab', { name: 'Hearts' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Search emojis'), { target: { value: 'robot' } });
    fireEvent.click(screen.getByRole('button', { name: 'robot' }));
    expect(onPick).toHaveBeenLastCalledWith('🤖');
    fireEvent.change(screen.getByLabelText('Search emojis'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No emojis match/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Custom reaction robo' }));
    expect(onPick).toHaveBeenLastCalledWith('custom:3');
  });

  it('Escape or a click outside closes it', () => {
    api.apiFetch.mockImplementation(() => json([]));
    const onClose = vi.fn();
    render(<div><button>outside</button><EmojiPicker onPick={vi.fn()} onClose={onClose} /></div>);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole('dialog', { name: 'Pick a reaction' })).getByLabelText('Search emojis')).toBeInTheDocument();
  });

  it('focuses search once; a new onClose (parent re-render) does not steal focus back', () => {
    api.apiFetch.mockImplementation(() => json([]));
    const { rerender } = render(<EmojiPicker onPick={vi.fn()} onClose={() => {}} />);
    expect(screen.getByLabelText('Search emojis')).toHaveFocus();
    const hearts = screen.getByRole('tab', { name: 'Hearts' });
    hearts.focus();
    rerender(<EmojiPicker onPick={vi.fn()} onClose={() => {}} />);
    expect(hearts).toHaveFocus();
  });
});

