import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn(), extractActionProposals: vi.fn() }));
vi.mock('../../services/aiService', async (orig) => ({ ...(await orig<object>()), ...ai }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { OutreachPage } from '../pages/outreach/OutreachPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const calls = (url: string, method: string) => api.apiFetch.mock.calls.filter((c) => c[0] === url && c[1]?.method === method);
const body = (url: string, method: string, n = -1) => JSON.parse(calls(url, method).at(n)![1].body);
const menu = async (label: string, item: RegExp) => {
  fireEvent.pointerDown(screen.getAllByRole('button', { name: label })[0], { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
};

const EVENTS = [
  { id: 1, title: 'Library demo', description: 'Showed the robot', date: '2026-08-10', hours: 2, location: 'Town library', attendees: 40, funds_raised: 0 },
  { id: 2, title: 'Bake sale', description: '', date: '2026-09-15', hours: 3, location: 'School', attendees: 0, funds_raised: 250 },
];
const PROFILES = [
  { id: 11, platform: 'youtube', display_name: 'Robo Channel', handle: '@robo', is_pinned: 0, latest: { followers: 1200, views: 50000, posts: 25 }, growth: { delta: 40, pct: 3.4 }, history: [1000, 1100, 1200], last_synced_at: Date.now() - 3600_000 },
  { id: 12, platform: 'youtube', display_name: 'Second', handle: '@two', is_pinned: 1, latest: { followers: 10 }, history: [] },
  { id: 13, platform: 'tiktok', display_name: 'Hidden TikTok', handle: '@tt', latest: { followers: 5 } },
];

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json({}));
  ai.streamBuildHelper.mockReset();
  ai.extractActionProposals.mockReset();
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});

function setup(over: Record<string, unknown> = {}) {
  const props = {
    outreach: EVENTS, setOutreach: vi.fn(), socialProfiles: PROFILES, setSocialProfiles: vi.fn(), youtubeEnabled: true,
    currentUser: { id: 7 }, onRefresh: vi.fn(), refresh: { outreach: vi.fn(), socialProfiles: vi.fn() }, hasScope: (s: string) => s === 'outreach', ...over,
  };
  return { ...render(<InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter><OutreachPage {...props} /></MemoryRouter></InterfaceModeProvider>), props };
}

describe('Modern Outreach', () => {
  it('shows impact totals, the newest event first, and YouTube channels (TikTok hidden)', () => {
    setup();
    expect(screen.getByText('People reached')).toBeInTheDocument();
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles.indexOf('Bake sale')).toBeLessThan(titles.indexOf('Library demo'));
    expect(screen.getByText('Robo Channel')).toBeInTheDocument();
    expect(screen.queryByText('Hidden TikTok')).not.toBeInTheDocument();
    expect(screen.getByText('+40 (+3.4%)')).toBeInTheDocument();
  });

  it('any member can log events; channel management needs the outreach permission', () => {
    setup({ hasScope: () => false });
    expect(screen.getByRole('button', { name: /Log event/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Actions for/ }).length).toBe(2);
    expect(screen.queryByRole('button', { name: /Manage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sync now/ })).not.toBeInTheDocument();
  });

  it('logs an event from a quick type (POST, numbers normalised)', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Log event/ }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Workshop' }));
    expect(screen.getByLabelText('Event title *')).toHaveValue('Workshop');
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: ' Library ' } });
    fireEvent.change(screen.getByLabelText('Attendees'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Funds ($)'), { target: { value: '12.345' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log event' }));
    await waitFor(() => expect(calls('/api/outreach', 'POST')).toHaveLength(1));
    expect(body('/api/outreach', 'POST')).toMatchObject({ title: 'Workshop', location: 'Library', attendees: 25, funds_raised: 12.35, hours: 2 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.refresh.outreach).toHaveBeenCalled();
  });

  it('needs a title', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Log event/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Log event' }));
    expect(dialog.notify).toHaveBeenCalledWith('Give the event a title.', 'error');
    expect(calls('/api/outreach', 'POST')).toHaveLength(0);
  });

  it('edits (PATCH) and deletes; a failed delete puts back only that event', async () => {
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'DELETE' ? json({}, false) : json({})));
    const { props } = setup();
    await menu('Actions for Library demo', /Edit event/);
    const hours = await screen.findByLabelText('Hours');
    expect(hours).toHaveValue(2);
    fireEvent.change(hours, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls('/api/outreach/1', 'PATCH')).toHaveLength(1));
    expect(body('/api/outreach/1', 'PATCH')).toMatchObject({ hours: 4, title: 'Library demo' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await menu('Actions for Library demo', /Delete event/);
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Could not delete event — try again.', 'error'));
    const restore = props.setOutreach.mock.calls.at(-1)![0];
    const fresh = [EVENTS[1], { id: 3, title: 'New', date: '2026-10-01' }];
    expect(restore(fresh).map((e: any) => e.id)).toEqual([1, 2, 3]);
  });

  it('Bruno AI: quick parse, drop a row, log the rest', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Bruno AI/ }));
    fireEvent.change(await screen.findByLabelText('Events'), { target: { value: 'Robotics demo | 2026-09-12 | 2 | Community center | 40 attendees\nSTEM workshop | 2026-09-18 | 3 | High school' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quick parse' }));
    expect(screen.getByRole('status')).toHaveTextContent('Found 2 events');
    fireEvent.click(screen.getByRole('button', { name: 'Remove STEM workshop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log all 1 event' }));
    await waitFor(() => expect(calls('/api/outreach', 'POST')).toHaveLength(1));
    expect(body('/api/outreach', 'POST')).toMatchObject({ title: 'Robotics demo', date: '2026-09-12', hours: 2, attendees: 40 });
    await waitFor(() => expect(props.refresh.outreach).toHaveBeenCalled());
    expect(dialog.notify).toHaveBeenCalledWith('Logged 1 of 1 outreach events.', 'success');
  });

  it('Bruno AI: "Parse with Bruno" turns proposals into rows', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => { onChunk('```outreach\n[]\n```'); });
    ai.extractActionProposals.mockReturnValue([{ kind: 'outreach', items: [{ title: 'Mall demo', date: '2026-10-02', hours: 3, attendees: 60 }] }]);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Bruno AI/ }));
    fireEvent.change(await screen.findByLabelText('Events'), { target: { value: 'we did a demo at the mall last friday, 60 people' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse with Bruno/ }));
    expect(await screen.findByText('Mall demo')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Bruno found 1 event');
  });

  it('channels: pin, sync and unlink (with confirm)', async () => {
    const { props } = setup();
    await menu('Manage Robo Channel', /Pin to top/);
    await waitFor(() => expect(calls('/api/outreach/social/11', 'PATCH')).toHaveLength(1));
    expect(body('/api/outreach/social/11', 'PATCH')).toEqual({ pinned: true });
    fireEvent.click(screen.getAllByRole('button', { name: /Sync now/ })[0]);
    await waitFor(() => expect(calls('/api/outreach/social/11/sync', 'POST')).toHaveLength(1));
    await menu('Manage Robo Channel', /Unlink/);
    await waitFor(() => expect(calls('/api/outreach/social/11', 'DELETE')).toHaveLength(1));
    expect(dialog.confirmDialog).toHaveBeenCalled();
    expect(props.refresh.socialProfiles).toHaveBeenCalled();
  });

  it('links a YouTube channel', async () => {
    setup({ socialProfiles: [] });
    fireEvent.click(screen.getByRole('button', { name: /Link YouTube channel/ }));
    fireEvent.change(await screen.findByLabelText('Channel'), { target: { value: '@robo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link channel' }));
    await waitFor(() => expect(calls('/api/outreach/social/youtube', 'POST')).toHaveLength(1));
    expect(body('/api/outreach/social/youtube', 'POST')).toEqual({ input: '@robo' });
  });

  it('a half-written event survives a remount, and a save in flight stays locked when you come back', async () => {
    let resolve: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'POST' ? new Promise((r) => { resolve = r; }) : json({})));
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: /Log event/ }));
    fireEvent.change(await screen.findByLabelText('Event title *'), { target: { value: 'Science fair' } });
    first.unmount();
    const second = setup();
    expect(await screen.findByLabelText('Event title *')).toHaveValue('Science fair');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log event' }));
    expect(screen.getByLabelText('Event title *')).toBeDisabled();
    second.unmount();
    setup();
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => { resolve({ ok: true, json: async () => ({}) }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls('/api/outreach', 'POST')).toHaveLength(1);
  });

  it("an old save finishing after a workspace switch doesn't unlock the new one", async () => {
    const pending: ((v: any) => void)[] = [];
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'POST' ? new Promise((r) => { pending.push(r); }) : json({})));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Log event/ }));
    fireEvent.change(await screen.findByLabelText('Event title *'), { target: { value: 'First' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log event' }));
    act(() => clearDrafts());
    fireEvent.click(screen.getAllByRole('button', { name: /Log event/ })[0]);
    fireEvent.change(await screen.findByLabelText('Event title *'), { target: { value: 'Second' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log event' }));
    expect(pending).toHaveLength(2);
    await act(async () => { pending[0]({ ok: true, json: async () => ({}) }); });
    expect(screen.getByLabelText('Event title *')).toBeDisabled();
    await act(async () => { pending[1]({ ok: true, json: async () => ({}) }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

