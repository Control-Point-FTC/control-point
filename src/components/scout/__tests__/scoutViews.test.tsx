import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FtcTeamProfile } from '../../../types/ftcScout';

const profile = (over: Partial<FtcTeamProfile>): FtcTeamProfile => ({
  number: 99999, name: 'BIOBUZZ', school: null, sponsors: [], city: null, state: null, country: null, rookieYear: 2025,
  season: 2025, seasons: [2025], totalTeams: null, opr: null, oprSource: null, events: [],
  source: 'first-events', fetchedAt: new Date().toISOString(), ...over,
} as FtcTeamProfile);

const api = vi.hoisted(() => ({
  fetchScoutTeam: vi.fn(),
  fetchScoutEvent: vi.fn(),
  fetchShortlist: vi.fn(),
  searchScoutTeams: vi.fn(),
}));
vi.mock('../../../services/ftcScoutApi', async (orig) => ({ ...(await orig<object>()), ...api }));

import { TeamScoutView } from '../CompeteView';
import { AnalyzeView } from '../AnalyzeView';
import { BRUNO_OPEN_EVENT, getScoutingContext, type BrunoOpenDetail } from '../../../services/brunoContext';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchShortlist.mockResolvedValue([]);
  api.searchScoutTeams.mockResolvedValue([]);
});

describe('TeamScoutView', () => {
  it('shows a friendly empty state (not an error) for a team with no season data', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile({}));
    render(<MemoryRouter><TeamScoutView number={99999} season={2025} onSeasonChange={() => {}} /></MemoryRouter>);
    expect(await screen.findByText(/data yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Season not started or no data is available yet/)).toBeInTheDocument();
    expect(screen.queryByText(/retry/i)).not.toBeInTheDocument();
  });

  it('shows an error with retry when both sources fail', async () => {
    api.fetchScoutTeam.mockRejectedValue(new Error('FTC data is temporarily unavailable'));
    render(<MemoryRouter><TeamScoutView number={4215} season={2025} onSeasonChange={() => {}} /></MemoryRouter>);
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('AnalyzeView', () => {
  it('sets the scouting context without opening Bruno unasked; Ask Bruno opens it with the greeting', async () => {
    api.fetchScoutTeam.mockResolvedValue(profile({ number: 4215, name: 'Mech', events: [] }));
    const opened: BrunoOpenDetail[] = [];
    const h = (e: Event) => opened.push((e as CustomEvent<BrunoOpenDetail>).detail);
    window.addEventListener(BRUNO_OPEN_EVENT, h);
    const { unmount } = render(<MemoryRouter><AnalyzeView season={2025} onSeasonChange={() => {}} myTeam={4215} /></MemoryRouter>);
    await waitFor(() => expect(getScoutingContext()).toMatchObject({ mode: 'analyze', season: 2025 }));
    expect(opened).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Ask Bruno/ }));
    await waitFor(() => expect(opened.length).toBe(1));
    expect(opened[0].greeting).toMatch(/scouting priorities/);
    expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    unmount();
    window.removeEventListener(BRUNO_OPEN_EVENT, h);
    expect(getScoutingContext()).toBeNull();
  });
});
