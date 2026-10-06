import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { FtcEventFull, FtcMatchFull, FtcTeamProfile } from '../../types/ftcScout';

const api = vi.hoisted(() => ({ fetchScoutTeam: vi.fn(), fetchScoutEvent: vi.fn(), fetchShortlist: vi.fn(), searchScoutTeams: vi.fn() }));
vi.mock('../../services/ftcScoutApi', async (orig) => ({ ...(await orig<object>()), ...api }));

import { InterfaceModeProvider } from '../interfaceMode';
import { TeamStatsPage } from '../pages/stats/TeamStatsPage';
import { TeamProfile } from '../pages/stats/TeamProfile';
import { ScoutHttpError } from '../../services/ftcScoutApi';
import { BRUNO_OPEN_EVENT, type BrunoOpenDetail } from '../../services/brunoContext';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

const split = (total: number, auto = 20, teleop = 50, endgame = 30, pen = 5) => ({ total, totalNp: total - pen, auto, teleop, endgame, penaltiesCommitted: pen, penaltiesByOpp: 0 });
const stats = (teamNumber: number, name: string, rank: number, opr: number) => ({
  teamNumber, name, rank, rp: 2.5, wins: 4, losses: 1, ties: 0, qualMatchesPlayed: 5, opr: split(opr, opr * 0.2, opr * 0.5, opr * 0.3), avg: null, awards: [],
});
const match = (n: number, red: number[], blue: number[], rs: number, bs: number, level: 'qual' | 'playoff' = 'qual'): FtcMatchFull => ({
  key: `${level}:${n}`, level, series: null, number: n, label: `${level === 'qual' ? 'Q' : 'M'}-${n}`, description: null, time: null, played: true,
  red: { teams: red.map((t) => ({ number: t, name: `T${t}` })), score: split(rs) },
  blue: { teams: blue.map((t) => ({ number: t, name: `T${t}` })), score: split(bs) },
  breakdownSource: 'ftc-scout',
});
const EVENT: FtcEventFull = {
  code: 'USNJQ1', season: 2025, name: 'NJ Qualifier', type: 'Qualifier', start: '2025-12-01', end: null, venue: 'Big Gym', city: 'Newark', state: 'NJ', country: 'USA',
  source: 'ftc-scout', fetchedAt: new Date().toISOString(),
  field: [stats(4215, 'Mech', 1, 120), stats(1111, 'Robo', 2, 90), stats(2222, 'Gears', 3, 60), stats(3333, 'Bolt', 4, 50)],
  matches: [match(1, [4215, 1111], [2222, 3333], 150, 90), match(2, [4215, 2222], [1111, 3333], 80, 100), match(1, [4215, 1111], [2222, 3333], 170, 60, 'playoff')],
  alliances: [{ number: 1, name: null, captain: 4215, picks: [1111] }],
};
const profile = (over: Partial<FtcTeamProfile> = {}): FtcTeamProfile => ({
  number: 4215, name: 'Mech', school: 'Hilltop High', sponsors: ['Acme', 'Globex', 'Initech'], city: 'Newark', state: 'NJ', country: 'USA', rookieYear: 2010,
  season: 2025, seasons: [2025, 2024], totalTeams: 8000,
  opr: { tot: { value: 120.4, rank: 12 }, auto: { value: 24, rank: 30 }, dc: { value: 60, rank: 20 }, eg: { value: 36, rank: 15 } }, oprSource: 'ftc-scout',
  events: [
    { code: 'USNJM1', name: 'NJ Meet 1', date: '2025-11-01', type: 'League Meet', city: null, state: null, stats: { ...stats(4215, 'Mech', 5, 80), awards: [] } },
    { code: 'USNJQ1', name: 'NJ Qualifier', date: '2025-12-01', type: 'Qualifier', city: 'Newark', state: 'NJ', stats: { ...stats(4215, 'Mech', 1, 120), awards: ['Inspire Award'] } },
  ],
  source: 'ftc-scout', fetchedAt: new Date().toISOString(), ...over,
} as FtcTeamProfile);

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchShortlist.mockResolvedValue([]);
  api.searchScoutTeams.mockResolvedValue([]);
  api.fetchScoutEvent.mockImplementation(async (_s: number, code: string) => ({ ...EVENT, code, name: code === 'USNJQ1' ? 'NJ Qualifier' : 'NJ Meet 1' }));
});
afterEach(cleanup);

let loc = '';
function Where() { const l = useLocation(); loc = l.pathname + l.search; return null; }
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const wrap = (ui: React.ReactNode, url = '/stats') => render(
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
    <MemoryRouter initialEntries={[url]}><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>
  </InterfaceModeProvider>,
);

describe('Modern Team Stats · Compete', () => {
  it('shows our team: hero, OPR with rank, trend chart and the event timeline (newest first)', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile());
    wrap(<TeamStatsPage />);
    expect(await screen.findByRole('heading', { name: '4215' })).toBeInTheDocument();
    expect(screen.getByText('Hilltop High')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Total OPR: 120.4/ })).toHaveTextContent('Rank #12');
    expect(screen.getByRole('radiogroup', { name: 'Trend metric' })).toBeInTheDocument();
    const events = screen.getAllByRole('button', { expanded: false }).filter((b) => /NJ (Qualifier|Meet 1)/.test(b.textContent ?? ''));
    expect(events[0]).toHaveTextContent('NJ Qualifier');
    expect(events[0]).toHaveTextContent('Inspire Award');
    // No compare UI anywhere.
    expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
  });

  it('opens an event lazily, then a match with its alliance breakdown', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile());
    wrap(<TeamStatsPage />);
    const ev = await screen.findByRole('button', { name: /NJ Qualifier/ });
    expect(api.fetchScoutEvent).not.toHaveBeenCalled();
    fireEvent.click(ev);
    expect(await screen.findByText('Against the field')).toBeInTheDocument();
    expect(api.fetchScoutEvent).toHaveBeenCalledWith(expect.any(Number), 'USNJQ1', { force: undefined });
    expect(screen.getByText('Qualification matches (2)')).toBeInTheDocument();
    expect(screen.getByText('Playoff matches (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Q-1: win, 150 to 90/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Red alliance · winner')).toBeInTheDocument();
    expect(within(sheet).getByText('Penalties committed')).toBeInTheDocument();
    expect(within(sheet).getByText(/Score difference/)).toHaveTextContent('60 (Red)');
  });

  it('"View team" from the event rankings hands the team to Analyze', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile());
    wrap(<TeamStatsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /NJ Qualifier/ }));
    await screen.findByText('Event rankings');
    fireEvent.click(screen.getByRole('button', { name: /1111 Robo/ }));
    await waitFor(() => expect(loc).toContain('mode=analyze'));
  });

  it('opens the OPR breakdown with each event against its average', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile());
    wrap(<TeamStatsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Total OPR: 120.4/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Total OPR (no penalties)')).toBeInTheDocument();
    expect(within(sheet).getByText(/rank #12 of 8,000/)).toBeInTheDocument();
    await waitFor(() => expect(api.fetchScoutEvent).toHaveBeenCalledTimes(2));
  });

  it('loads partners & opponents on demand and lists shared matches', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile());
    wrap(<TeamStatsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Load partner & opponent history/ }));
    await waitFor(() => expect(api.fetchScoutEvent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Partners/ })).toBeInTheDocument());
    expect(screen.getAllByText('T1111').length).toBeGreaterThan(0);
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Actions for team 1111' })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /View matches/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/With 1111 T1111/)).toBeInTheDocument();
    expect(within(sheet).getAllByRole('button', { name: /Open match details/ })).toHaveLength(4); // 2 shared matches × 2 events
  });

  it('steps back once from an empty current season', async () => {
    api.fetchScoutTeam.mockImplementation(async (season: number) => (season === 2026 ? profile({ season: 2026, seasons: [2026, 2025], events: [], opr: { tot: null, auto: null, dc: null, eg: null } }) : profile()));
    wrap(<TeamStatsPage />);
    expect(await screen.findByRole('heading', { name: '4215' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /2025–26/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('switches to Analyze from the mode tabs', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile());
    wrap(<TeamStatsPage />);
    await screen.findByRole('heading', { name: '4215' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Analyze/ }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(loc).toBe('/stats?mode=analyze'));
  });
});

describe('Modern TeamProfile states', () => {
  it('a team with no season data gets a friendly empty state, not an error', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile({ number: 99999, name: 'BIOBUZZ', events: [], opr: { tot: null, auto: null, dc: null, eg: null } }));
    wrap(<TeamProfile number={99999} season={2025} onSeasonChange={() => {}} />);
    expect(await screen.findByText(/data yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Season not started or no data is available yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('both sources down: an error with Retry', async () => {
    api.fetchScoutTeam.mockRejectedValue(new Error('FTC data is temporarily unavailable'));
    wrap(<TeamProfile number={4215} season={2025} onSeasonChange={() => {}} />);
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    api.fetchScoutTeam.mockResolvedValue(profile());
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('heading', { name: '4215' })).toBeInTheDocument();
  });

  it('no FTC team connected: points to workspace settings', async () => {
    api.fetchScoutTeam.mockRejectedValue(new ScoutHttpError('No FTC team connected', 404));
    wrap(<TeamProfile number={null} season={2025} onSeasonChange={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Go to Settings/ }));
    expect(loc).toBe('/settings?section=workspace');
  });

  it('host actions: Scout with Bruno, shortlist and pin', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile({ number: 1111, name: 'Robo' }));
    const onAddShortlist = vi.fn(), onTogglePin = vi.fn();
    const opened: BrunoOpenDetail[] = [];
    const h = (e: Event) => opened.push((e as CustomEvent<BrunoOpenDetail>).detail);
    window.addEventListener(BRUNO_OPEN_EVENT, h);
    wrap(<TeamProfile number={1111} season={2025} onSeasonChange={() => {}} actions={{ onAddShortlist, onTogglePin, pinned: () => true }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Add to shortlist/ }));
    expect(onAddShortlist).toHaveBeenCalledWith(1111, 'Robo');
    fireEvent.click(screen.getByRole('button', { name: /Unpin/ }));
    expect(onTogglePin).toHaveBeenCalledWith(1111, 'Robo');
    fireEvent.click(screen.getByRole('button', { name: /Scout with Bruno/ }));
    expect(opened.at(-1)?.prompt).toMatch(/Scout team 1111 \(Robo\)/);
    window.removeEventListener(BRUNO_OPEN_EVENT, h);
  });
});
