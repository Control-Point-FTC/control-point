import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FtcEventFull, FtcMatchFull, FtcTeamProfile, ShortlistEntry } from '../../types/ftcScout';

const api = vi.hoisted(() => ({
  fetchScoutTeam: vi.fn(), fetchScoutEvent: vi.fn(), fetchShortlist: vi.fn(), searchScoutTeams: vi.fn(),
  saveShortlistPatch: vi.fn(), removeShortlistEntry: vi.fn(),
}));
vi.mock('../../services/ftcScoutApi', async (orig) => ({ ...(await orig<object>()), ...api }));

import { InterfaceModeProvider } from '../interfaceMode';
import { AnalyzeWorkspace } from '../pages/stats/AnalyzeWorkspace';
import { clearDrafts } from '../drafts';
import { BRUNO_OPEN_EVENT, getScoutingContext, type BrunoOpenDetail } from '../../services/brunoContext';
import { applyShortlistPatch } from '../../utils/shortlist';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

const split = (total: number) => ({ total, totalNp: total, auto: total * 0.2, teleop: total * 0.5, endgame: total * 0.3, penaltiesCommitted: 3, penaltiesByOpp: 0 });
const stats = (teamNumber: number, name: string, rank: number, opr: number) => ({
  teamNumber, name, rank, rp: 3 - rank / 10, wins: 5 - rank, losses: rank - 1, ties: 0, qualMatchesPlayed: 5, opr: split(opr), avg: split(opr * 1.2), awards: [],
});
const match = (n: number, red: number[], blue: number[], played = true): FtcMatchFull => ({
  key: `qual:${n}`, level: 'qual', series: null, number: n, label: `Q-${n}`, description: null, time: null, played,
  red: { teams: red.map((t) => ({ number: t, name: `T${t}` })), score: played ? split(100) : null },
  blue: { teams: blue.map((t) => ({ number: t, name: `T${t}` })), score: played ? split(80) : null },
  breakdownSource: 'ftc-scout',
});
const EVENT: FtcEventFull = {
  code: 'USNJQ1', season: 2025, name: 'NJ Qualifier', type: 'Qualifier', start: '2099-12-01', end: null, venue: null, city: 'Newark', state: 'NJ', country: 'USA',
  source: 'ftc-scout', fetchedAt: new Date().toISOString(),
  field: [stats(4215, 'Mech', 2, 80), stats(1111, 'Robo', 1, 60), stats(2222, 'Gears', 3, 120), stats(3333, 'Bolt', 4, 40)],
  matches: [match(1, [4215, 1111], [2222, 3333]), match(2, [2222, 4215], [1111, 3333], false)],
  alliances: [],
};
const profile = (number: number, name: string): FtcTeamProfile => ({
  number, name, school: null, sponsors: [], city: null, state: null, country: null, rookieYear: 2010, season: 2025, seasons: [2025], totalTeams: 100,
  opr: { tot: { value: 80, rank: 5 }, auto: null, dc: null, eg: null }, oprSource: 'ftc-scout',
  events: [{ code: 'USNJQ1', name: 'NJ Qualifier', date: '2099-12-01', type: 'Qualifier', city: null, state: null, stats: stats(number, name, 2, 80) }],
  source: 'ftc-scout', fetchedAt: new Date().toISOString(),
} as FtcTeamProfile);
const entry = (n: number, over: Partial<ShortlistEntry> = {}): ShortlistEntry => ({
  teamNumber: n, teamName: `Team ${n}`, season: 2025, eventCode: 'USNJQ1', notes: '', priority: 'medium', scoutNext: false, strengths: [], weaknesses: [], updatedAt: new Date().toISOString(), ...over,
});

let server: ShortlistEntry[] = [];
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  localStorage.clear();
  clearDrafts();
  server = [];
  api.fetchScoutTeam.mockImplementation(async (_s: number, n?: number | null) => (n ? profile(n, n === 1111 ? 'Robo' : `Team ${n}`) : profile(4215, 'Mech')));
  api.fetchScoutEvent.mockResolvedValue(EVENT);
  api.searchScoutTeams.mockResolvedValue([{ number: 1111, name: 'Robo', city: 'Trenton', state: 'NJ' }]);
  api.fetchShortlist.mockImplementation(async () => server);
  api.saveShortlistPatch.mockImplementation(async (p: any) => {
    const cur = server.find((e) => e.teamNumber === p.teamNumber) ?? null;
    const next = applyShortlistPatch(cur, p, new Date().toISOString());
    server = cur ? server.map((e) => (e.teamNumber === p.teamNumber ? next : e)) : [...server, next];
    return server;
  });
  api.removeShortlistEntry.mockImplementation(async (_s: number, n: number) => { server = server.filter((e) => e.teamNumber !== n); return server; });
});
afterEach(cleanup);

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const wrap = (ui: React.ReactNode) => render(
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter>{ui}</MemoryRouter></InterfaceModeProvider>,
);
const setup = (props: Partial<React.ComponentProps<typeof AnalyzeWorkspace>> = {}) => wrap(<AnalyzeWorkspace season={2025} onSeasonChange={() => {}} myTeam={4215} {...props} />);
const tab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
const teamOrder = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent?.match(/^\d+/)?.[0]);

describe('Modern Analyze', () => {
  it('greets with Bruno, sets the scouting context and has no compare UI', async () => {
    const opened: BrunoOpenDetail[] = [];
    const h = (e: Event) => opened.push((e as CustomEvent<BrunoOpenDetail>).detail);
    window.addEventListener(BRUNO_OPEN_EVENT, h);
    const { unmount } = setup();
    await waitFor(() => expect(opened.length).toBeGreaterThan(0));
    expect(opened[0].greeting).toMatch(/scouting priorities/);
    await waitFor(() => expect(getScoutingContext()).toMatchObject({ mode: 'analyze', season: 2025, eventCode: 'USNJQ1' }));
    expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    unmount();
    window.removeEventListener(BRUNO_OPEN_EVENT, h);
    expect(getScoutingContext()).toBeNull();
  });

  it('event field: our event by default, sortable, filterable', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'NJ Qualifier' })).toBeInTheDocument();
    expect(teamOrder()).toEqual(['1111', '4215', '2222', '3333']);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by OPR' }));
    expect(teamOrder()).toEqual(['2222', '4215', '1111', '3333']);
    fireEvent.change(screen.getByLabelText('Filter teams'), { target: { value: 'gea' } });
    expect(teamOrder()).toEqual(['2222']);
    fireEvent.change(screen.getByLabelText('Filter teams'), { target: { value: '' } });
    // Played red in a qual: 4215 and 1111 (Q-1) plus 2222 (Q-2 is unplayed but still a red slot).
    fireEvent.click(screen.getByRole('radio', { name: /Red/ }));
    expect(teamOrder().sort()).toEqual(['1111', '2222', '4215']);
  });

  it('a row peeks the team in a side sheet; "Open in Team detail" moves it to the Team tab', async () => {
    setup();
    await screen.findByRole('heading', { name: 'NJ Qualifier' });
    fireEvent.click(screen.getAllByRole('button', { name: /^1111 Robo/ })[0]);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByRole('heading', { name: '1111' })).toBeInTheDocument();
    await waitFor(() => expect(getScoutingContext()).toMatchObject({ selectedTeam: 1111 }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open in Team detail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Team detail/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: '1111' })).toBeInTheDocument();
  });

  it('search opens any team in Team detail and remembers it as recent', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search teams by number or name'), { target: { value: 'robo' } });
    fireEvent.click(await screen.findByRole('option', { name: /1111 Robo/ }, { timeout: 2000 }));
    expect(screen.getByRole('tab', { name: /Team detail/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: '1111' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1111' })).toBeInTheDocument(); // recent quick pick
  });

  it('shortlist from the field menu, then edit priority / scout-next / tags', async () => {
    setup();
    await screen.findByRole('heading', { name: 'NJ Qualifier' });
    await waitFor(() => expect(api.fetchShortlist).toHaveBeenCalled());
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Actions for team 2222' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Add to shortlist/ }));
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenCalledWith(expect.objectContaining({ teamNumber: 2222, teamName: 'Gears', eventCode: 'USNJQ1' }), expect.anything()));
    tab(/Shortlist/);
    const card = await screen.findByRole('article', { name: /2222/ });
    fireEvent.click(within(card).getByRole('radio', { name: 'high' }));
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenLastCalledWith(expect.objectContaining({ teamNumber: 2222, priority: 'high' }), expect.anything()));
    fireEvent.click(within(card).getByRole('switch'));
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenLastCalledWith(expect.objectContaining({ scoutNext: true }), expect.anything()));
    fireEvent.change(within(card).getByLabelText('Custom tag'), { target: { value: 'Fast intake' } });
    fireEvent.click(within(card).getByRole('button', { name: /Strength/ }));
    expect(await within(card).findByText('Fast intake')).toBeInTheDocument();
  });

  it('a half-written shortlist note survives a remount (mode switch), and saves on blur', async () => {
    server = [entry(1111)];
    const first = setup();
    tab(/Shortlist/);
    const notes = await screen.findByLabelText('Notes');
    fireEvent.change(notes, { target: { value: 'Great auto, slow climb' } });
    first.unmount();
    setup();
    tab(/Shortlist/);
    const again = await screen.findByLabelText('Notes');
    expect(again).toHaveValue('Great auto, slow climb');
    expect(api.saveShortlistPatch).not.toHaveBeenCalled();
    fireEvent.blur(again);
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenCalledWith(expect.objectContaining({ teamNumber: 1111, notes: 'Great auto, slow climb' }), expect.anything()));
  });

  it('pinning from a team menu adds a quick pick', async () => {
    setup();
    await screen.findByRole('heading', { name: 'NJ Qualifier' });
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Actions for team 3333' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Pin team/ }));
    expect(screen.getByRole('button', { name: '3333' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('controlpoint-scout-pins') || '[]')).toEqual([{ number: 3333, name: 'Bolt' }]);
  });

  it('"View matches" lists a team\'s matches and opens one', async () => {
    setup();
    await screen.findByRole('heading', { name: 'NJ Qualifier' });
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Actions for team 4215' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /View matches/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/4215 Mech · matches/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /^Q-1/ }));
    await waitFor(() => expect(screen.getByText('Red alliance · winner')).toBeInTheDocument());
    await act(async () => {});
  });

  it('removing a team drops its note draft; re-adding it starts with no note', async () => {
    server = [entry(1111)];
    setup();
    tab(/Shortlist/);
    fireEvent.change(await screen.findByLabelText('Notes'), { target: { value: 'B' } });
    fireEvent.blur(screen.getByLabelText('Notes'));
    await waitFor(() => expect(api.saveShortlistPatch).toHaveBeenCalledWith(expect.objectContaining({ notes: 'B' }), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1111 from shortlist' }));
    await waitFor(() => expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument());
    // Re-added (e.g. by a teammate) with an empty note.
    cleanup();
    server = [entry(1111)];
    setup();
    tab(/Shortlist/);
    expect(await screen.findByLabelText('Notes')).toHaveValue('');
  });

  it('a failed note save keeps the typed text', async () => {
    server = [entry(1111)];
    api.saveShortlistPatch.mockRejectedValue(new Error('Server error'));
    setup();
    tab(/Shortlist/);
    fireEvent.change(await screen.findByLabelText('Notes'), { target: { value: 'Keep me' } });
    fireEvent.blur(screen.getByLabelText('Notes'));
    expect(await screen.findByText(/wasn't saved/)).toBeInTheDocument();
    await waitFor(() => expect(api.fetchShortlist).toHaveBeenCalledTimes(2)); // reconcile after the failure
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep me');
  });
});

