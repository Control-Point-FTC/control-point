import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FtcTeamProfile } from '../../../types/ftcScout';

const scout = vi.hoisted(() => ({ fetchScoutTeam: vi.fn(), fetchScoutEvent: vi.fn() }));
vi.mock('../../../services/ftcScoutApi', async (orig) => ({ ...(await orig<object>()), ...scout }));
const predict = vi.hoisted(() => ({ fetchForecast: vi.fn(), fetchPartners: vi.fn(), fetchPredictStatus: vi.fn() }));
vi.mock('../../../services/predictApi', async (orig) => ({ ...(await orig<object>()), ...predict }));

import { PredictView } from '../PredictView';
import { PredictError } from '../../../services/predictApi';
import { getScreenContext, setScreenRoute } from '../../../services/brunoContext';

const profile = (events: FtcTeamProfile['events']): FtcTeamProfile => ({
  number: 4215, name: 'Mech', school: null, sponsors: [], city: null, state: null, country: null, rookieYear: 2010,
  season: 2025, seasons: [2025], totalTeams: null, opr: null, oprSource: null, events,
  source: 'ftcscout', fetchedAt: new Date().toISOString(),
} as unknown as FtcTeamProfile);
const ev = (code: string, type: string, date: string) => ({ code, name: `Event ${code}`, date, type, city: null, state: null, stats: null });

const team = (n: number, p: number) => ({
  team: n, pAdvance: p, pCaptain: 0.5, pPicked: 0.3, pWin: 0.2, pFinalist: 0.4,
  rank: { mean: 3, p10: 2, p90: 5 }, points: { quals: 10, alliance: 12, playoffs: 8, awards: n === 4215 ? 5 : null, matchPoints: 30, total: n === 4215 ? 35 : null },
});
const forecast = {
  season: 2025, event: 'USNJCMPPKWY', eventName: 'NJ Parkway', eventStart: null, eventEnd: null, myTeam: 4215,
  stage: 'pre', slots: 4, slotsSource: 'estimated', runs: 2000, generatedAt: new Date().toISOString(),
  teams: [team(1111, 0.9), team(4215, 0.63)], prequalified: [], matchesOnly: { pAdvance: 0.55 },
  assumptions: ['Advancement slots are estimated.'],
  matches: [{ key: 'Q-1', label: 'Q-1', level: 'qual', red: [4215, 1111], blue: [2222, 3333], pRedWin: 0.7, redMean: 120, blueMean: 90, played: null }],
};

beforeEach(() => {
  [...Object.values(scout), ...Object.values(predict)].forEach((f) => f.mockReset());
  scout.fetchScoutEvent.mockResolvedValue({ field: [{ teamNumber: 1111, name: 'Robo' }, { teamNumber: 4215, name: 'Mech' }] });
  predict.fetchPredictStatus.mockRejectedValue(new Error('x'));
});
afterEach(cleanup);

const renderView = (url = '/predict') => render(<MemoryRouter initialEntries={[url]}><PredictView /></MemoryRouter>);

describe('PredictView', () => {
  it('opens the next advancing event, skips championship parents, and shows our odds', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([
      ev('USNJNOM3', 'League Meet', '2025-11-08'),
      ev('USNJCMP', 'Championship', '2099-03-15'),
      ev('USNJCMPPKWY', 'Championship', '2099-03-15'),
    ]));
    predict.fetchForecast.mockResolvedValue(forecast);
    setScreenRoute('/predict', 'Predict');
    renderView();
    expect((await screen.findAllByText('63%')).length).toBeGreaterThan(0);
    expect(predict.fetchForecast).toHaveBeenCalledWith(expect.any(Number), 'USNJCMPPKWY', expect.anything());
    expect(screen.getByText(/from match results alone/)).toBeInTheDocument();
    expect(getScreenContext()).toMatchObject({ predictEvent: 'USNJCMPPKWY' });
  });

  it('lists matches with our team highlighted', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchForecast.mockResolvedValue(forecast);
    renderView('/predict?season=2025&event=USNJCMPPKWY');
    await screen.findAllByText('63%');
    fireEvent.click(screen.getByRole('tab', { name: /matches/i }));
    expect(screen.getByText('Q-1')).toBeInTheDocument();
    expect(screen.getByText('Red 70%')).toBeInTheDocument();
  });

  it('explains warm-up and unsupported events instead of erroring', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('FPERR', 'Premier', '2099-05-28')]));
    predict.fetchForecast.mockRejectedValue(new PredictError('This championship is split into divisions.', 422));
    renderView();
    expect(await screen.findByText(/split into divisions/)).toBeInTheDocument();
    cleanup();
    predict.fetchForecast.mockRejectedValue(new PredictError('warming', 503));
    renderView();
    expect(await screen.findByText(/warming up/i)).toBeInTheDocument();
  });
});
