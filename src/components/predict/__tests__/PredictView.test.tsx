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
  matches: [{ key: 'Q-1', label: 'Q-1', level: 'qual', red: [4215, 1111], blue: [2222, 3333], pRedWin: 0.7, redMean: 120, blueMean: 90, played: null }, { key: "Q-2", label: "Q-2", level: "qual", red: [4215, 2222], blue: [1111, 3333], pRedWin: null, redMean: null, blueMean: null, played: { red: 150, blue: 90 } }],
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
    predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({ ...forecast, season, event }));
    setScreenRoute('/predict', 'Predict');
    renderView();
    expect((await screen.findAllByText('63%')).length).toBeGreaterThan(0);
    expect(predict.fetchForecast).toHaveBeenCalledWith(expect.any(Number), 'USNJCMPPKWY', expect.anything());
    expect(screen.getByText(/from match results alone/)).toBeInTheDocument();
    expect(getScreenContext()).toMatchObject({ predictEvent: 'USNJCMPPKWY' });
  });

  it('lists matches with our team highlighted', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({ ...forecast, season, event }));
    renderView('/predict?season=2025&event=USNJCMPPKWY');
    await screen.findAllByText('63%');
    fireEvent.click(screen.getByRole('tab', { name: /matches/i }));
    expect(screen.getByText('Q-1')).toBeInTheDocument();
    expect(screen.getByText('Red 70%')).toBeInTheDocument();
    expect(screen.getByText('Red won')).toBeInTheDocument();
    expect(screen.queryByText(/called it/i)).not.toBeInTheDocument();
  });

  it('labels played matches from odds recorded before they were played', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    const played = (key: string, pre: number | null, red: number, blue: number) => ({ key, label: key, level: 'qual', red: [4215, 1111], blue: [2222, 3333], pRedWin: null, redMean: null, blueMean: null, played: { red, blue }, pre });
    predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({
      ...forecast, season, event,
      matches: [played('Q-1', 0.7, 100, 50), played('Q-2', 0.8, 50, 100), played('Q-3', null, 90, 10)],
    }));
    renderView('/predict?season=2025&event=USNJCMPPKWY');
    await screen.findAllByText('63%');
    fireEvent.click(screen.getByRole('tab', { name: /matches/i }));
    expect(screen.getByText('Called it · 70%')).toBeInTheDocument();
    expect(screen.getByText('Upset · 20%')).toBeInTheDocument();
    expect(screen.getByText('No pre-match call')).toBeInTheDocument();
  });

  it('shows live-this-season accuracy next to the back-test', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({ ...forecast, season, event }));
    const adv = { brier: 0.1, calibrationError: 0.01 };
    predict.fetchPredictStatus.mockResolvedValue({
      ready: true, readyAt: '', syncing: false, seasons: [2025],
      accuracy: { testSeason: '2025–26', matches: { count: 100, liveAccuracy: 0.72, liveBrier: 0.18, preEventAccuracy: 0.68, oprAccuracy: 0.65, oprBrier: 0.2, scoreRange80Coverage: 0.8 },
        advancement: { events: 5, pre: adv, quals: adv, selected: adv, matchesOnlyPre: adv, naiveTopRanked: { brier: 0.15 }, calibrationPre: [] }, partners: null, pickTop3: 0.5 },
      live: { season: 2025, matches: { n: 420, accuracy: 0.705, brier: 0.19, upsets: 124 }, advancement: { pre: { n: 80, events: 4, brier: 0.12 }, quals: { n: 0, events: 0, brier: 0 }, selected: { n: 0, events: 0, brier: 0 } }, updatedAt: '' },
    });
    renderView('/predict?season=2025&event=USNJCMPPKWY');
    fireEvent.click(await screen.findByText(/How accurate is this/));
    expect(await screen.findByText('Live this season')).toBeInTheDocument();
    expect(screen.getByText('70.5%')).toBeInTheDocument();
    expect(screen.getByText(/420 matches · 124 upsets/)).toBeInTheDocument();
    expect(screen.getByText('Advancement odds before the event')).toBeInTheDocument();
    expect(screen.queryByText('Advancement odds after quals')).not.toBeInTheDocument();
  });

  it('shows advancement scores even with no played match calls, and refetches when the sheet opens', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({ ...forecast, season, event }));
    const adv = { brier: 0.1, calibrationError: 0.01 };
    const status = (n: number) => ({
      ready: true, readyAt: '', syncing: false, seasons: [2025],
      accuracy: { testSeason: '2025–26', matches: { count: 100, liveAccuracy: 0.72, liveBrier: 0.18, preEventAccuracy: 0.68, oprAccuracy: 0.65, oprBrier: 0.2, scoreRange80Coverage: 0.8 },
        advancement: { events: 5, pre: adv, quals: adv, selected: adv, matchesOnlyPre: adv, naiveTopRanked: { brier: 0.15 }, calibrationPre: [] }, partners: null, pickTop3: 0.5 },
      live: { season: 2025, matches: { n: 0, accuracy: 0, brier: 0, upsets: 0 }, advancement: { pre: { n, events: 1, brier: 0.11 }, quals: { n: 0, events: 0, brier: 0 }, selected: { n: 0, events: 0, brier: 0 } }, updatedAt: '' },
    });
    predict.fetchPredictStatus.mockResolvedValue(status(0));
    renderView('/predict?season=2025&event=USNJCMPPKWY');
    await screen.findAllByText('63%');
    predict.fetchPredictStatus.mockResolvedValue(status(30));
    fireEvent.click(screen.getByText(/How accurate is this/));
    expect(await screen.findByText('Advancement odds before the event')).toBeInTheDocument();
    expect(screen.getByText('No recorded match calls have been played yet.')).toBeInTheDocument();
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

describe('PredictView selection', () => {
  it("doesn't show an old event's forecast while another event loads", async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('AAA', 'Qualifier', '2099-01-01'), ev('BBB', 'Qualifier', '2099-02-01')]));
    predict.fetchForecast.mockImplementation(async (season: number, event: string) =>
      event === 'AAA' ? { ...forecast, season, event } : new Promise(() => {}));
    renderView();
    await screen.findAllByText('63%');
    fireEvent.click(screen.getByRole('combobox', { name: /event/i }));
    fireEvent.click(await screen.findByText(/Event BBB/));
    expect(screen.queryByText('63%')).not.toBeInTheDocument();
  });
});
