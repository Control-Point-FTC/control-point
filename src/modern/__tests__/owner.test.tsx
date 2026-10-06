import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { OwnerPage } from '../pages/owner/OwnerPage';
import { CheckinPage } from '../pages/attendance/CheckinPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true, status = ok ? 200 : 400) => Promise.resolve({ ok, status, json: async () => body });
const me = { id: 1, name: 'Owner', team_id: 1, interface_mode: 'modern' };
const calls = (url: string | RegExp, method?: string) => api.apiFetch.mock.calls.filter((c) => (typeof url === 'string' ? c[0] === url : url.test(c[0])) && (method ? c[1]?.method === method : !c[1]?.method));
const body = (url: string, method: string) => JSON.parse(calls(url, method).at(-1)![1].body);

const USERS = [
  { id: 11, name: 'Ada', email: 'ada@x.test', team_name: 'Robo', account_type: 'student', flags_open: 1, warnings: 0, tokens_7d: 12000 },
  { id: 12, name: 'Bo', email: 'bo@x.test', team_name: 'Gears', account_type: 'mentor', ai_disabled: 1 },
];
const DB: Record<string, any> = {
  '/api/owner/overview': { totals: { teams: 2, users: 2, feedback: 1, new_feedback: 1 }, teams: [{ id: 1, name: 'Robo', access_code: 'ABC', number: 4215, member_count: 9, message_count: 120, task_count: 30, feedback_count: 1 }, { id: 2, name: 'Gears', access_code: 'XYZ', member_count: 4, message_count: 10, task_count: 2, feedback_count: 0 }] },
  '/api/owner/feedback': [{ id: 31, category: 'bug', status: 'new', message: 'Calendar is slow', user_name: 'Ada', user_email: 'ada@x.test', team_name: 'Robo', created_at: '2026-09-01T10:00:00Z' }],
  '/api/owner/users': USERS,
  '/api/owner/ai-flags': [{ id: 41, reason: 'homework', status: 'open', user_name: 'Ada', user_email: 'ada@x.test', member_id: 11, team_name: 'Robo', excerpt: 'write my essay', created_at: '2026-09-02T10:00:00Z' }],
  '/api/owner/users/11': { user: { id: 11, name: 'Ada', email: 'ada@x.test', team_name: 'Robo', team_id: 1, role: 'member', account_type: 'student', ai_daily_token_limit: 5000, google_id: 'g' }, usage14: [{ day: '2026-09-01', messages: 3, tokens: 900 }], warnings: [], flags: [], siblings: [] },
};

beforeEach(() => {
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
  clearDrafts();
});
afterEach(cleanup);

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
