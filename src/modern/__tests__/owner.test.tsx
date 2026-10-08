import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn(), promptDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { OwnerPage } from '../pages/owner/OwnerPage';
import { CheckinPage } from '../pages/attendance/CheckinPage';
import { clearDrafts, getDraft, setDraft } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true, status = ok ? 200 : 400) => Promise.resolve({ ok, status, json: async () => body });
const me = { id: 1, name: 'Owner', team_id: 1, interface_mode: 'modern' };
const calls = (url: string | RegExp, method?: string) => api.apiFetch.mock.calls.filter((c) => (typeof url === 'string' ? c[0] === url : url.test(c[0])) && (method ? c[1]?.method === method : !c[1]?.method));
const body = (url: string, method: string) => JSON.parse(calls(url, method).at(-1)![1].body);

const USERS = [
  { id: 11, name: 'Ada', email: 'ada@x.test', team_id: 1, team_name: 'Robo', account_type: 'student', flags_open: 1, warnings: 0, tokens_7d: 12000 },
  { id: 12, name: 'Bo', email: 'bo@x.test', team_id: 2, team_name: 'Gears', account_type: 'mentor', ai_disabled: 1 },
];
const DB: Record<string, any> = {
  '/api/owner/overview': { totals: { teams: 2, users: 2, feedback: 1, new_feedback: 1 }, teams: [{ id: 1, name: 'Robo', access_code: 'ABC', number: 4215, member_count: 9, message_count: 120, task_count: 30, feedback_count: 1 }, { id: 2, name: 'Gears', access_code: 'XYZ', member_count: 4, message_count: 10, task_count: 2, feedback_count: 0 }] },
  '/api/owner/feedback': [{ id: 31, category: 'bug', status: 'new', message: 'Calendar is slow', user_name: 'Ada', user_email: 'ada@x.test', team_name: 'Robo', created_at: '2026-09-01T10:00:00Z' }],
  '/api/owner/users': USERS,
  '/api/owner/ai-flags': [{ id: 41, reason: 'homework', status: 'open', user_name: 'Ada', user_email: 'ada@x.test', member_id: 11, team_name: 'Robo', excerpt: 'write my essay', created_at: '2026-09-02T10:00:00Z' }],
  '/api/owner/users/11': { user: { id: 11, name: 'Ada', email: 'ada@x.test', team_name: 'Robo', team_id: 1, role: 'member', account_type: 'student', ai_daily_token_limit: 5000, google_id: 'g' }, usage14: [{ day: '2026-09-01', messages: 3, tokens: 900 }], warnings: [], flags: [], siblings: [] },
};

beforeEach(() => {
  localStorage.removeItem('cp-owner-feedback-view');
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: any) => {
    if (init?.method) return json({ deleted: [1], skipped: [] });
    if (url.startsWith('/api/owner/ai-overview')) return json({ today: { messages: 7, tokens: 15000, users: 3 }, flags: { open: 1 }, daily: [{ date: '2026-09-01', messages: 7, tokens: 15000 }], top: [{ id: 11, name: 'Ada', email: 'ada@x.test', tokens: 12000, messages: 40 }], providers: [] });
    if (url.startsWith('/api/owner/ai-flags')) return json(DB['/api/owner/ai-flags']);
    return json(DB[url] ?? null);
  });
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  dialog.promptDialog.mockReset();
  dialog.promptDialog.mockResolvedValue(true);
  clearDrafts();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const setup = () => render(<InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter><OwnerPage /></MemoryRouter></InterfaceModeProvider>);
const tab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });

describe('Modern Owner console', () => {
  it('overview: totals and every workspace', async () => {
    setup();
    expect(await screen.findByRole('cell', { name: /Robo/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'ABC' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Flags/ })).toHaveTextContent('1');
    expect(api.apiFetch.mock.calls.some((c) => /ai-overview\?tz=/.test(c[0]))).toBe(true);
  });

  it('users: search and team filter; quick delete confirms', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    expect(await screen.findByText('ada@x.test · Robo · student · 12.0k tokens / 7d')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'bo@' } });
    expect(screen.queryByText(/ada@x.test/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bo' }));
    await waitFor(() => expect(calls('/api/owner/users/12', 'DELETE')).toHaveLength(1));
    expect(dialog.confirmDialog).toHaveBeenCalled();
  });

  it('flags: a drafted note goes with the action', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Flags/);
    const card = await screen.findByRole('article', { name: /Homework-like by Ada/ });
    fireEvent.change(within(card).getByLabelText('Reviewer note'), { target: { value: 'first warning' } });
    fireEvent.click(within(card).getByRole('button', { name: /Warn/ }));
    await waitFor(() => expect(calls('/api/owner/ai-flags/41', 'PATCH')).toHaveLength(1));
    expect(body('/api/owner/ai-flags/41', 'PATCH')).toEqual({ action: 'warn', note: 'first warning' });
  });

  it('feedback: resolving removes it', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Feedback/);
    expect(await screen.findByText('Calendar is slow')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(screen.queryByText('Calendar is slow')).not.toBeInTheDocument());
    expect(body('/api/owner/feedback/31', 'PATCH')).toEqual({ status: 'resolved' });
  });

  it('user sheet: kill switch, timeout, budgets, warn, move and delete', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Manage' }))[0]);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('via Google')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Daily token limit')).toHaveValue('5000');
    fireEvent.click(within(sheet).getByRole('switch'));
    await waitFor(() => expect(body('/api/owner/users/11/ai', 'PATCH')).toEqual({ ai_disabled: true }));
    fireEvent.click(within(sheet).getByRole('button', { name: /24 hours/ }));
    await waitFor(() => expect(body('/api/owner/users/11/ai', 'PATCH')).toEqual({ timeoutHours: 24 }));
    fireEvent.change(within(sheet).getByLabelText('Max tokens / reply'), { target: { value: '8a00' } });
    expect(within(sheet).getByLabelText('Max tokens / reply')).toHaveValue('800');
    fireEvent.submit(within(sheet).getByLabelText('Max tokens / reply').closest('form')!);
    await waitFor(() => expect(body('/api/owner/users/11/ai', 'PATCH')).toEqual({ ai_max_tokens_reply: '800' }));
    fireEvent.change(within(sheet).getByLabelText('Warning reason'), { target: { value: 'homework' } });
    fireEvent.submit(within(sheet).getByLabelText('Warning reason').closest('form')!);
    await waitFor(() => expect(body('/api/owner/users/11/warn', 'POST')).toEqual({ note: 'homework' }));
    fireEvent.click(within(sheet).getByRole('button', { name: /Remove from Robo/ }));
    await waitFor(() => expect(calls('/api/owner/users/11', 'DELETE')).toHaveLength(1));
  });

  it('a half-typed warning survives a remount', async () => {
    const first = setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Manage' }))[0]);
    fireEvent.change(await screen.findByLabelText('Warning reason'), { target: { value: 'half typed' } });
    first.unmount();
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Manage' }))[0]);
    expect(await screen.findByLabelText('Warning reason')).toHaveValue('half typed');
  });
});

describe('Owner feedback views', () => {
  const note = DB['/api/owner/feedback'][0];
  const feedback = async (notes = [note]) => {
    const original = api.apiFetch.getMockImplementation()!;
    api.apiFetch.mockImplementation((url: string, init?: any) => url === '/api/owner/feedback' && !init?.method ? json(notes) : original(url, init));
    const rendered = setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Feedback/);
    return rendered;
  };
  const choose = (view: 'Grid' | 'List') => fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Feedback view' })).getByRole('radio', { name: view }));

  it('defaults to responsive grid cards and switches to the original list', async () => {
    await feedback();
    const notes = screen.getByRole('list', { name: 'Feedback notes' });
    expect(notes).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3');
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
    choose('List');
    expect(notes).toHaveClass('space-y-3');
    expect(notes).not.toHaveClass('grid');
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    // Clicking the selected item must not clear the view.
    choose('List');
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
  });

  it('remembers the view on re-render, tab return and remount', async () => {
    const first = await feedback();
    choose('List');
    expect(localStorage.getItem('cp-owner-feedback-view')).toBe('list');
    first.rerender(<InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter><OwnerPage /></MemoryRouter></InterfaceModeProvider>);
    expect(screen.getByRole('list', { name: 'Feedback notes' })).toHaveClass('space-y-3');
    tab(/Overview/);
    tab(/Feedback/);
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    first.unmount();
    await feedback();
    expect(screen.getByRole('list', { name: 'Feedback notes' })).toHaveClass('space-y-3');
    choose('Grid');
    expect(localStorage.getItem('cp-owner-feedback-view')).toBe('grid');
  });

  it('defaults to grid for an invalid stored view', async () => {
    localStorage.setItem('cp-owner-feedback-view', 'unknown');
    await feedback();
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps working when storage reads and writes throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    await feedback();
    expect(screen.getByRole('list', { name: 'Feedback notes' })).toHaveClass('grid');
    choose('List');
    expect(screen.getByRole('list', { name: 'Feedback notes' })).toHaveClass('space-y-3');
    choose('Grid');
    expect(screen.getByRole('list', { name: 'Feedback notes' })).toHaveClass('grid');
  });

  it.each(['Grid', 'List'] as const)('%s preserves resolve, reopen and the empty state', async (view) => {
    await feedback([{ ...note, status: 'resolved' }]);
    choose(view);
    const reopen = screen.getByRole('button', { name: 'Reopen' });
    expect(reopen).toHaveClass('max-sm:h-11');
    fireEvent.click(reopen);
    await screen.findByRole('button', { name: 'Resolve' });
    expect(body('/api/owner/feedback/31', 'PATCH')).toEqual({ status: 'new' });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('No feedback yet')).toBeInTheDocument();
    expect(body('/api/owner/feedback/31', 'PATCH')).toEqual({ status: 'resolved' });
    expect(calls('/api/owner/feedback/31', 'PATCH')).toHaveLength(2);
  });

  it.each(['Grid', 'List'] as const)('%s preserves image, video, file attachments and metadata', async (view) => {
    await feedback([
      { ...note, screenshot_url: '/image.png', attachment_type: 'image/png' },
      { ...note, id: 32, message: 'Video note', screenshot_url: '/video.mp4', attachment_type: 'video/mp4' },
      { ...note, id: 33, message: 'File note', screenshot_url: '/logs.txt', attachment_name: 'logs.txt', attachment_type: 'text/plain' },
    ]);
    choose(view);
    const notes = screen.getByRole('list', { name: 'Feedback notes' });
    expect(within(notes).getAllByRole('listitem')).toHaveLength(3);
    const image = screen.getByAltText('Feedback attachment');
    expect(image).toHaveAttribute('src', '/image.png');
    const link = image.closest('a')!;
    expect(link).toHaveAttribute('href', '/image.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    const video = notes.querySelector('video')!;
    expect(video).toHaveAttribute('src', '/video.mp4');
    expect(video).toHaveAttribute('controls');
    const file = screen.getByRole('link', { name: 'logs.txt' });
    expect(file).toHaveAttribute('href', '/logs.txt');
    expect(file).toHaveAttribute('target', '_blank');
    expect(file).toHaveAttribute('rel', 'noreferrer');
    expect(within(notes).getAllByText(/Ada · ada@x.test · Robo · Sep 1, 2026/)).toHaveLength(3);
  });

  it('expands overflowing grid messages without clamping list messages', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120);
    await feedback();
    const message = screen.getByText(note.message);
    expect(message).toHaveClass('line-clamp-6');
    const more = screen.getByRole('button', { name: 'Show more' });
    expect(more).toHaveAttribute('aria-controls', message.id);
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(message).not.toHaveClass('line-clamp-6');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(message).toHaveClass('line-clamp-6');
    choose('List');
    expect(screen.getByText(note.message)).not.toHaveClass('line-clamp-6');
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('does not offer expansion for messages that fit', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
    await feedback();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});

describe('Owner console races', () => {
  it('a budget save keeps a newer edit, and shows the saved value otherwise', async () => {
    let finish: () => void = () => {};
    let limit: number | null = 5000;
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/owner/users/11/ai' && init?.method === 'PATCH') {
        const b = JSON.parse(init.body);
        return new Promise((r) => { finish = () => { limit = b.ai_daily_token_limit === '0' ? null : Number(b.ai_daily_token_limit); r({ ok: true, status: 200, json: async () => ({}) }); }; });
      }
      if (url === '/api/owner/users/11') return json({ ...DB[url], user: { ...DB[url].user, ai_daily_token_limit: limit } });
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [], providers: [] });
      return json(DB[url.split('?')[0]] ?? null);
    });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Manage' }))[0]);
    const sheet = await screen.findByRole('dialog');
    const input = await within(sheet).findByLabelText('Daily token limit');
    await waitFor(() => expect(input).toHaveValue('5000'));
    // Save 6000, then keep typing before it lands: the newer edit stays.
    fireEvent.change(input, { target: { value: '6000' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.change(input, { target: { value: '7000' } });
    await act(async () => { finish(); });
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Daily limit saved', 'success'));
    expect(input).toHaveValue('7000');
    // Saving 0 removes the limit: the input shows the server's value (empty = Unlimited).
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.submit(input.closest('form')!);
    await act(async () => { finish(); });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('a note typed while a warning or flag action is sending is kept', async () => {
    const pending: Array<() => void> = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (init?.method) return new Promise((r) => { pending.push(() => r({ ok: true, status: 200, json: async () => ({}) })); });
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 1 }, daily: [], top: [], providers: [] });
      if (url.startsWith('/api/owner/ai-flags')) return json(DB['/api/owner/ai-flags']);
      return json(DB[url] ?? null);
    });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Flags/);
    const card = await screen.findByRole('article', { name: /by Ada/ });
    const note = within(card).getByLabelText('Reviewer note');
    fireEvent.change(note, { target: { value: 'first' } });
    fireEvent.click(within(card).getByRole('button', { name: /Warn/ }));
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(note, { target: { value: 'second thoughts' } });
    await act(async () => { pending.shift()!(); });
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Warning recorded', 'success'));
    expect(within(screen.getByRole('article', { name: /by Ada/ })).getByLabelText('Reviewer note')).toHaveValue('second thoughts');

    tab(/Users/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Manage' }))[0]);
    const reason = await screen.findByLabelText('Warning reason');
    fireEvent.change(reason, { target: { value: 'homework' } });
    fireEvent.submit(reason.closest('form')!);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(reason, { target: { value: 'next one' } });
    await act(async () => { pending.shift()!(); });
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Warning recorded', 'success'));
    expect(screen.getByLabelText('Warning reason')).toHaveValue('next one');
  });

  it('a destination picked while a move is sending is kept', async () => {
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/owner/users/11/move') return new Promise((r) => { finish = () => r({ ok: true, status: 200, json: async () => ({}) }); });
      if (init?.method) return json({});
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [], providers: [] });
      return json(DB[url.split('?')[0]] ?? null);
    });
    setDraft('owner:move:11', '2');
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Manage' }))[0]);
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Move' }));
    await waitFor(() => expect(calls('/api/owner/users/11/move', 'POST')).toHaveLength(1));
    act(() => setDraft('owner:move:11', '1')); // picked again (e.g. after reopening the sheet)
    await act(async () => { finish(); });
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Moved to Gears', 'success'));
    expect(getDraft('owner:move:11', '')).toBe('1');
  });

  it('user rows are single list items', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    await screen.findAllByRole('button', { name: 'Manage' });
    const items = screen.getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: 'Manage' }));
    expect(items).toHaveLength(2);
    items.forEach((li) => expect(li.querySelector('li')).toBeNull());
  });

  it('an older flags response never replaces a newer one', async () => {
    let releaseAll: () => void = () => {};
    api.apiFetch.mockImplementation((url: string) => {
      // "All": headers arrive at once but the body is slow, landing after "Open".
      if (url === '/api/owner/ai-flags?status=all') return json(null).then(() => ({ ok: true, status: 200, json: () => new Promise((r) => { releaseAll = () => r([{ ...DB['/api/owner/ai-flags'][0], id: 40, user_name: 'Stale' }]); }) }));
      if (url.startsWith('/api/owner/ai-flags')) return json([{ ...DB['/api/owner/ai-flags'][0], user_name: 'Fresh' }]);
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 1 }, daily: [], top: [], providers: [] });
      return json(DB[url] ?? null);
    });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Flags/);
    expect(await screen.findByRole('article', { name: /by Fresh/ })).toBeInTheDocument();
    const filter = screen.getByRole('radiogroup', { name: 'Flag filter' });
    fireEvent.click(within(filter).getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(calls('/api/owner/ai-flags?status=all')).toHaveLength(1));
    fireEvent.click(within(filter).getByRole('radio', { name: 'Open' }));
    await waitFor(() => expect(calls('/api/owner/ai-flags?status=open').length).toBeGreaterThan(0));
    await act(async () => { releaseAll(); });
    expect(screen.queryByRole('article', { name: /by Stale/ })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /by Fresh/ })).toBeInTheDocument();
  });
});

describe('Modern QR check-in', () => {
  const checkin = (token = 'tok') => render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={[`/checkin/${token}`]}><Routes><Route path="/checkin/:token" element={<CheckinPage currentUser={{ name: 'Ada' }} onRefresh={vi.fn()} />} /></Routes></MemoryRouter>
    </InterfaceModeProvider>,
  );

  it('asks, then checks in', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => (init?.method === 'POST' ? json({ ok: true }) : json({ teamName: 'Robo', isMember: true, memberName: 'Ada', expiresAt: '2026-10-06T18:00:00Z' })));
    checkin();
    fireEvent.click(await screen.findByRole('button', { name: /Yes, I'm here/ }));
    expect(await screen.findByRole('heading', { name: "You're checked in" })).toBeInTheDocument();
    expect(calls('/api/attendance/checkin/tok', 'POST')).toHaveLength(1);
  });

  it('wrong team and expired sessions explain themselves', async () => {
    api.apiFetch.mockImplementation(() => json({ teamName: 'Gears', isMember: false, expiresAt: '2026-10-06T18:00:00Z' }));
    checkin();
    expect(await screen.findByRole('heading', { name: 'Wrong team' })).toBeInTheDocument();
    cleanup();
    api.apiFetch.mockImplementation(() => json({ error: 'Session expired' }, false));
    checkin();
    expect(await screen.findByText('Session expired')).toBeInTheDocument();
    await act(async () => {});
  });
});

describe('Owner console — What’s new', () => {
  it('lists releases and publishes a new one with one change per line', async () => {
    const entries = [{ id: 1, version: '3.5.0', date: '2026-10-08', title: 'Repeating events', added: ['A'], improved: [], fixed: [], posted_at: null }];
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/owner/changelog' && !init?.method) return json({ entries, discord: false });
      if (url === '/api/owner/changelog' && init?.method === 'POST') return json({ entry: { id: 2, ...JSON.parse(init.body), posted_at: null } });
      return json(DB[url] ?? null);
    });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/What’s new/);
    expect(await screen.findByText('Repeating events')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New release/ }));
    expect((screen.getByLabelText('Version') as HTMLInputElement).value).toBe('3.6.0');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Notebook' } });
    fireEvent.change(document.getElementById('cl-added')!, { target: { value: 'Personal notebook\n\nBruno writes pages' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(calls('/api/owner/changelog', 'POST')).toHaveLength(1));
    expect(body('/api/owner/changelog', 'POST')).toMatchObject({ version: '3.6.0', title: 'Notebook', added: ['Personal notebook', 'Bruno writes pages'], improved: [], fixed: [] });
    expect(await screen.findByText('Notebook')).toBeInTheDocument();
  });
});

describe('Owner console — redesign', () => {
  const withOverview = (overview: any, extra: Record<string, any> = {}) => api.apiFetch.mockImplementation((url: string, init?: any) => {
    if (init?.method) return json({});
    if (url === '/api/owner/overview') return json(overview);
    if (url in extra) return json(extra[url]);
    if (url.startsWith('/api/owner/ai-overview')) return json({ today: { messages: 0 }, flags: { open: 2 }, daily: [], top: [] });
    if (url.startsWith('/api/owner/ai-flags')) return json([]);
    return json(DB[url] ?? null);
  });
  const OV = DB['/api/owner/overview'];

  it('overview: what needs you, each item opening its tab', async () => {
    withOverview({ ...OV, totals: { ...OV.totals, new_feedback: 1, crashes_7d: 4 }, email: { configured: true, lastOkAt: null, lastError: 'bad key', lastErrorAt: '2026-10-08T00:00:00Z' } });
    setup();
    const strip = await screen.findByRole('region', { name: 'Needs your attention' });
    expect(within(strip).getByText('2 open AI flags')).toBeInTheDocument();
    expect(within(strip).getByText('1 new feedback note')).toBeInTheDocument();
    expect(within(strip).getByText('Email is failing')).toBeInTheDocument();
    fireEvent.click(within(strip).getByRole('button', { name: /4 error reports/ }));
    expect(screen.getByRole('tab', { name: /Errors/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('overview: all clear when nothing needs you', async () => {
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/owner/overview') return json({ ...OV, totals: { ...OV.totals, new_feedback: 0, crashes_7d: 0 } });
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [] });
      if (url.startsWith('/api/owner/ai-flags')) return json([]);
      return json(DB[url] ?? null);
    });
    setup();
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument();
  });

  it('workspaces: search, sort by any column, and open their users', async () => {
    withOverview({ ...OV, teams: [...OV.teams, { id: 3, name: 'Alpha', access_code: 'QQQ', member_count: 1, message_count: 500, task_count: 0, feedback_count: 0, last_message_at: '2026-10-07T18:30:00.000Z' }] });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    // Most members first by default.
    expect(names()).toEqual(['Robo #4215', 'Gears', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }));
    expect(names()).toEqual(['Alpha', 'Robo #4215', 'Gears']);
    expect(screen.getByRole('columnheader', { name: /Messages/ })).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }));
    expect(names()).toEqual(['Gears', 'Robo #4215', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
    expect(names()).toEqual(['Alpha', 'Gears', 'Robo #4215']);
    expect(screen.getAllByText('Never')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search workspaces'), { target: { value: '4215' } });
    expect(names()).toEqual(['Robo #4215']);
    expect(screen.getByText('Workspaces (1 of 3)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Users in Robo' }));
    expect(await screen.findByText(/ada@x.test/)).toBeInTheDocument();
    expect(screen.queryByText(/bo@x.test/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(screen.getByText(/bo@x.test/)).toBeInTheDocument();
  });

  it('users: status filter and sort', async () => {
    const users = [
      ...USERS,
      { id: 13, name: 'Cy', email: 'cy@x.test', team_id: 1, team_name: 'Robo', warnings: 2, msgs_7d: 3, tokens_7d: 90000, last_ai_use: '2026-10-07 12:00:00' },
    ];
    withOverview(OV, { '/api/owner/users': users });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Users/);
    await screen.findByText(/cy@x.test/);
    const order = () => screen.getAllByRole('button', { name: /^Delete / }).map((b) => b.getAttribute('aria-label'));
    expect(order()).toEqual(['Delete Ada', 'Delete Bo', 'Delete Cy']);
    expect(screen.getByText(/last AI Oct 7/)).toBeInTheDocument();
    const pick = (label: string, option: string) => {
      fireEvent.click(screen.getByRole('combobox', { name: label }));
      fireEvent.click(screen.getByRole('option', { name: option }));
    };
    pick('Sort users', 'AI tokens (7 days)');
    expect(order()).toEqual(['Delete Cy', 'Delete Ada', 'Delete Bo']);
    pick('Filter by status', 'Warned');
    expect(order()).toEqual(['Delete Cy']);
    expect(screen.getByText('Users (1 of 3)')).toBeInTheDocument();
    pick('Filter by status', 'AI limited or off');
    expect(order()).toEqual(['Delete Bo']);
    pick('Filter by status', 'Open flags');
    expect(order()).toEqual(['Delete Ada']);
    pick('Filter by status', 'No AI this week');
    expect(order()).toEqual(['Delete Ada', 'Delete Bo']);
  });

  it('errors: a group opens to its latest reports with the stack', async () => {
    const errors = {
      groups: [{ message: 'Cannot read x', route: '/tasks', kind: 'render', n: 2, last_seen: '2026-10-08 09:00:00' }],
      recent: [
        { id: 2, message: 'Cannot read x', route: '/tasks', kind: 'render', created_at: '2026-10-08 09:00:00', team_name: 'Robo', release: 'abc123', user_agent: 'Firefox', stack: 'at Board (tasks.tsx:10)' },
        { id: 1, message: 'Other', route: '/tasks', kind: 'render', created_at: '2026-10-08 08:00:00', stack: 'at Elsewhere' },
      ],
    };
    withOverview(OV, { '/api/owner/client-errors': errors });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Errors/);
    const toggle = await screen.findByRole('button', { name: /Cannot read x/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const list = screen.getByRole('list', { name: 'Latest reports' });
    expect(within(list).getByText('at Board (tasks.tsx:10)')).toBeInTheDocument();
    expect(within(list).getByText(/Robo · release abc123/)).toBeInTheDocument();
    expect(within(list).queryByText('at Elsewhere')).not.toBeInTheDocument();
  });

  it('refresh reloads everything without blanking the page', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    api.apiFetch.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(screen.getByRole('cell', { name: /Robo/ })).toBeInTheDocument();
    await waitFor(() => expect(calls('/api/owner/overview')).toHaveLength(1));
    expect(calls('/api/owner/users')).toHaveLength(1);
    expect(calls('/api/owner/ftc-duplicates')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/ })).not.toBeDisabled());
  });

  it('workspaces: the owner deletes one after typing its name', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    dialog.promptDialog.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gears' }));
    await waitFor(() => expect(dialog.promptDialog).toHaveBeenCalledWith(expect.objectContaining({ expected: 'Gears', danger: true })));
    expect(calls('/api/owner/teams/2', 'DELETE')).toHaveLength(0);
    api.apiFetch.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gears' }));
    await waitFor(() => expect(calls('/api/owner/teams/2', 'DELETE')).toHaveLength(1));
    expect(body('/api/owner/teams/2', 'DELETE')).toEqual({ confirm: 'Gears' });
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Gears deleted.', 'success'));
    await waitFor(() => expect(calls('/api/owner/overview')).toHaveLength(1));
    // Shared FTC numbers reload too (the deleted workspace may have been one).
    await waitFor(() => expect(calls('/api/owner/ftc-duplicates')).toHaveLength(1));
  });

  it('users: workspaces are told apart by id, even with the same name (or "all")', async () => {
    const users = [
      { id: 21, name: 'Ann', email: 'ann@x.test', team_id: 7, team_name: 'all' },
      { id: 22, name: 'Ben', email: 'ben@x.test', team_id: 8, team_name: 'Twins' },
      { id: 23, name: 'Cat', email: 'cat@x.test', team_id: 9, team_name: 'Twins' },
    ];
    const teams = [{ id: 7, name: 'all', member_count: 1 }, { id: 8, name: 'Twins', member_count: 1 }, { id: 9, name: 'Twins', member_count: 1 }];
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/owner/overview') return json({ ...DB['/api/owner/overview'], teams });
      if (url === '/api/owner/users') return json(users);
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [] });
      if (url.startsWith('/api/owner/ai-flags')) return json([]);
      return json(DB[url] ?? null);
    });
    setup();
    await screen.findByRole('cell', { name: 'all' });
    // Equal member counts sort newest first: the second Twins (#9) is on top.
    fireEvent.click(screen.getAllByRole('button', { name: 'Users in Twins' })[0]);
    expect(await screen.findByText(/cat@x.test/)).toBeInTheDocument();
    expect(screen.queryByText(/ben@x.test/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter by team' }));
    expect(screen.getByRole('option', { name: 'Twins (#8)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'all' }));
    expect(screen.getByText(/ann@x.test/)).toBeInTheDocument();
    expect(screen.queryByText(/cat@x.test/)).not.toBeInTheDocument();
  });

  it('a refresh that fails keeps what is on screen', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    api.apiFetch.mockImplementation(() => json({ error: 'down' }, false, 503));
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/ })).not.toBeDisabled());
    expect(screen.getByRole('cell', { name: /Robo/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Flags/ })).toHaveTextContent('1');
    tab(/Users/);
    expect(await screen.findByText(/ada@x.test/)).toBeInTheDocument();
  });

  it('a slow first load cannot overwrite a newer refresh', async () => {
    let releaseFirst: () => void = () => {};
    let first = true;
    const OV = DB['/api/owner/overview'];
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/owner/overview' && first) {
        first = false;
        return new Promise((res) => { releaseFirst = () => res({ ok: true, status: 200, json: async () => ({ ...OV, teams: [{ ...OV.teams[0], name: 'Old name' }] }) }); });
      }
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [] });
      if (url.startsWith('/api/owner/ai-flags')) return json([]);
      return json(DB[url] ?? null);
    });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Refresh/ }));
    expect(await screen.findByRole('cell', { name: /Robo/ })).toBeInTheDocument();
    await act(async () => { releaseFirst(); });
    expect(screen.queryByRole('cell', { name: /Old name/ })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /Robo/ })).toBeInTheDocument();
  });

  it('errors: the open group follows its error across a refresh, and both stacks show', async () => {
    const g = (message: string, n: number) => ({ message, route: '/tasks', kind: 'render', n, last_seen: '2026-10-08 09:00:00' });
    let groups = [g('First', 5), g('Second', 3)];
    const recent = [{ id: 1, message: 'Second', route: '/tasks', kind: 'render', created_at: '2026-10-08 09:00:00', stack: 'at js (a.ts:1)', component_stack: 'in Board' }];
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/owner/client-errors') return json({ groups, recent });
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [] });
      if (url.startsWith('/api/owner/ai-flags')) return json([]);
      return json(DB[url] ?? null);
    });
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    tab(/Errors/);
    fireEvent.click(await screen.findByRole('button', { name: /Second/ }));
    expect(screen.getByText('JavaScript stack')).toBeInTheDocument();
    expect(screen.getByText('React component stack')).toBeInTheDocument();
    expect(screen.getByText('in Board')).toBeInTheDocument();
    // Second overtakes First: the open one is still Second.
    groups = [g('Second', 9), g('First', 5)];
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Second/ })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: /First/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('Refresh keeps spinning until every running refresh is done (a delete during a refresh)', async () => {
    setup();
    await screen.findByRole('cell', { name: /Robo/ });
    const held: (() => void)[] = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (init?.method) return json({ ok: true, deleted: { id: 2, name: 'Gears', members: 4 } });
      if (url === '/api/owner/overview') return new Promise((res) => { held.push(() => res({ ok: true, status: 200, json: async () => DB[url] })); });
      if (url.startsWith('/api/owner/ai-overview')) return json({ today: {}, flags: { open: 0 }, daily: [], top: [] });
      if (url.startsWith('/api/owner/ai-flags')) return json([]);
      return json(DB[url] ?? null);
    });
    const button = () => screen.getByRole('button', { name: /Refresh/ });
    fireEvent.click(button());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gears' }));
    await waitFor(() => expect(held).toHaveLength(2));
    await act(async () => { held[1](); });
    expect(button()).toBeDisabled();
    await act(async () => { held[0](); });
    await waitFor(() => expect(button()).not.toBeDisabled());
  });
});
