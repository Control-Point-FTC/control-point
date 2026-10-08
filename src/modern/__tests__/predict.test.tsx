import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { FtcTeamProfile } from '../../types/ftcScout';

const scout = vi.hoisted(() => ({ fetchScoutTeam: vi.fn(), fetchScoutEvent: vi.fn() }));
vi.mock('../../services/ftcScoutApi', async (orig) => ({ ...(await orig<object>()), ...scout }));
const predict = vi.hoisted(() => ({ fetchForecast: vi.fn(), fetchPartners: vi.fn(), fetchPredictStatus: vi.fn() }));
vi.mock('../../services/predictApi', async (orig) => ({ ...(await orig<object>()), ...predict }));

import { InterfaceModeProvider } from '../interfaceMode';
import { PredictPage } from '../pages/predict/PredictPage';
import { PredictError } from '../../services/predictApi';
import { getScreenContext, setScreenRoute } from '../../services/brunoContext';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

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
  stage: 'quals', slots: 4, slotsSource: 'estimated', runs: 2000, generatedAt: new Date().toISOString(),
  teams: [team(1111, 0.9), team(4215, 0.63), team(2222, 0.2)], prequalified: [], matchesOnly: { pAdvance: 0.55 },
  assumptions: ['Advancement slots are estimated.'],
  matches: [
    { key: 'Q-1', label: 'Q-1', level: 'qual', red: [4215, 1111], blue: [2222, 3333], pRedWin: 0.7, redMean: 120, blueMean: 90, played: null },
    { key: 'Q-2', label: 'Q-2', level: 'qual', red: [4215, 2222], blue: [1111, 3333], pRedWin: null, redMean: null, blueMean: null, played: { red: 150, blue: 90 }, pre: 0.7 },
    { key: 'Q-3', label: 'Q-3', level: 'qual', red: [1111, 2222], blue: [3333, 5555], pRedWin: null, redMean: null, blueMean: null, played: { red: 50, blue: 100 }, pre: 0.8 },
  ],
};
const adv = { brier: 0.1, calibrationError: 0.01 };
const status = (liveMatches: number, advN = 80) => ({
  ready: true, readyAt: '', syncing: false, seasons: [2025],
  accuracy: { testSeason: '2025–26', matches: { count: 100, liveAccuracy: 0.72, liveBrier: 0.18, preEventAccuracy: 0.68, oprAccuracy: 0.65, oprBrier: 0.2, scoreRange80Coverage: 0.8 },
    advancement: { events: 5, pre: adv, quals: adv, selected: adv, matchesOnlyPre: adv, naiveTopRanked: { brier: 0.15 }, calibrationPre: [{ predicted: 0.2, actual: 0.25 }, { predicted: 0.8, actual: 0.75 }] }, partners: null, pickTop3: 0.5 },
  live: { season: 2025, matches: { n: liveMatches, accuracy: 0.705, brier: 0.19, upsets: 124 }, advancement: { pre: { n: advN, events: 4, brier: 0.12 }, quals: { n: 0, events: 0, brier: 0 }, selected: { n: 0, events: 0, brier: 0 } }, updatedAt: '' },
});

beforeEach(() => {
  [...Object.values(scout), ...Object.values(predict)].forEach((f) => f.mockReset());
  scout.fetchScoutEvent.mockResolvedValue({ field: [{ teamNumber: 1111, name: 'Robo' }, { teamNumber: 4215, name: 'Mech' }, { teamNumber: 2222, name: 'Gears' }] });
  predict.fetchPredictStatus.mockRejectedValue(new Error('x'));
  predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({ ...forecast, season, event }));
});
afterEach(cleanup);

let loc = '';
function Where() { loc = useLocation().pathname + useLocation().search; return null; }
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const renderPage = (url = '/predict') => render(
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="*" element={<><PredictPage /><Where /></>} /></Routes>
    </MemoryRouter>
  </InterfaceModeProvider>,
);
const tab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });

describe('Modern Predict', () => {
  it('opens the next advancing event (skipping championship parents), shows our outlook and tells Bruno', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([
      ev('USNJNOM3', 'League Meet', '2025-11-08'),
      ev('USNJCMP', 'Championship', '2099-03-15'),
      ev('USNJCMPPKWY', 'Championship', '2099-03-15'),
    ]));
    setScreenRoute('/predict', 'Predict');
    renderPage();
    await waitFor(() => expect(screen.getAllByText('63%').length).toBeGreaterThan(0));
    expect(predict.fetchForecast).toHaveBeenCalledWith(expect.any(Number), 'USNJCMPPKWY', expect.anything());
    // Only the division is offered as an event chip.
    const events = screen.getByRole('radiogroup', { name: 'Event' });
    expect(within(events).getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText(/from match results alone/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Quals finished');
    expect(getScreenContext()).toMatchObject({ predictEvent: 'USNJCMPPKWY' });
    await waitFor(() => expect(loc).toContain('event=USNJCMPPKWY'));
  });

  it('switching events hides the old forecast while the new one loads', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('AAA', 'Qualifier', '2099-01-01'), ev('BBB', 'Qualifier', '2099-02-01')]));
    predict.fetchForecast.mockImplementation(async (season: number, event: string) =>
      event === 'AAA' ? { ...forecast, season, event } : new Promise(() => {}));
    renderPage();
    await waitFor(() => expect(screen.getAllByText('63%').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('radio', { name: /Event BBB/ }));
    expect(screen.queryByText('63%')).not.toBeInTheDocument();
    await waitFor(() => expect(loc).toContain('event=BBB'));
  });

  it('matches: predicted odds, results and honest pre-match calls, with filters', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    renderPage('/predict?season=2025&event=USNJCMPPKWY');
    await waitFor(() => expect(screen.getAllByText('63%').length).toBeGreaterThan(0));
    tab(/matches/i);
    expect(await screen.findByText('Red 70%')).toBeInTheDocument();
    expect(screen.getByText('Red won')).toBeInTheDocument();
    expect(screen.getByText('Called it · 70%')).toBeInTheDocument();
    // Q-3 doesn't include us: hidden until "only our matches" is turned off.
    expect(screen.queryByText('Q-3')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText('Upset · 20%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Upcoming' }));
    expect(screen.getByText('Q-1')).toBeInTheDocument();
    expect(screen.queryByText('Q-2')).not.toBeInTheDocument();
    // A filter with nothing in it says so (not "schedule not published").
    predict.fetchForecast.mockImplementation(async (season: number, event: string) => ({ ...forecast, season, event, matches: forecast.matches.filter((m) => m.played) }));
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText('No upcoming matches')).toBeInTheDocument();
    expect(screen.queryByText('No matches yet')).not.toBeInTheDocument();
  });

  it('field: every team with ours marked, searchable', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    renderPage('/predict?season=2025&event=USNJCMPPKWY');
    await waitFor(() => expect(screen.getAllByText('63%').length).toBeGreaterThan(0));
    tab(/field/i);
    expect(await screen.findByText('Robo')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Find a team'), { target: { value: 'gears' } });
    expect(screen.queryByText('Robo')).not.toBeInTheDocument();
    expect(screen.getByText('Gears')).toBeInTheDocument();
  });

  it('alliance: ranks partners, and Refresh re-runs scenarios bypassing the cache', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchPartners.mockResolvedValue({ role: 'captain', baseline: { pAdvance: 0.6, pCaptain: 0.8 }, options: [{ team: 1111, pAdvance: 0.75, pWin: 0.3 }, { team: 2222, pAdvance: 0.55, pWin: 0.1 }] });
    renderPage('/predict?season=2025&event=USNJCMPPKWY');
    await waitFor(() => expect(screen.getAllByText('63%').length).toBeGreaterThan(0));
    tab(/alliance/i);
    expect(await screen.findByText('Who should we pick?')).toBeInTheDocument();
    expect(screen.getByText('Best fit')).toBeInTheDocument();
    expect(screen.getByText('+15 pts')).toBeInTheDocument();
    expect(screen.getByText('-5 pts')).toBeInTheDocument();
    expect(predict.fetchPartners).toHaveBeenLastCalledWith(2025, 'USNJCMPPKWY', { force: false });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(predict.fetchPartners).toHaveBeenLastCalledWith(2025, 'USNJCMPPKWY', { force: true }));
    expect(predict.fetchForecast).toHaveBeenLastCalledWith(2025, 'USNJCMPPKWY', { force: true });
  });

  it('accuracy sheet: live scores next to the back-test, refetched on open', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchPredictStatus.mockResolvedValue(status(0, 0));
    renderPage('/predict?season=2025&event=USNJCMPPKWY');
    await waitFor(() => expect(screen.getAllByText('63%').length).toBeGreaterThan(0));
    predict.fetchPredictStatus.mockResolvedValue(status(420));
    fireEvent.click(screen.getByRole('button', { name: /How accurate is this/ }));
    expect(await screen.findByText('Live this season')).toBeInTheDocument();
    expect(await screen.findByText('70.5%')).toBeInTheDocument();
    expect(screen.getByText(/420 matches · 124 upsets/)).toBeInTheDocument();
    expect(screen.getByText('Advancement odds before the event')).toBeInTheDocument();
    expect(screen.queryByText('Advancement odds after quals')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Calibration/ })).toBeInTheDocument();
    // The long-form explainer opens in a new tab.
    const link = screen.getByRole('link', { name: /How Predict works/ });
    expect(link).toHaveAttribute('href', '/predict/how-it-works');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows how old the ratings are, and warns once syncs stop landing', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchPredictStatus.mockResolvedValue({ ...status(0), dataAsOf: new Date(Date.now() - 3 * 3600_000).toISOString() });
    renderPage('/predict?season=2025&event=USNJCMPPKWY');
    expect(await screen.findByText('Ratings synced 3 h ago')).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
    // Refresh re-checks the age: a server whose syncs stopped is flagged.
    predict.fetchPredictStatus.mockResolvedValue({ ...status(0), dataAsOf: new Date(Date.now() - 3 * 864e5).toISOString() });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText(/odds may be out of date/)).toBeInTheDocument();
  });

  it('accuracy sheet: advancement scores show even with no played match calls', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('USNJCMPPKWY', 'Championship', '2099-03-15')]));
    predict.fetchPredictStatus.mockResolvedValue(status(0, 30));
    renderPage('/predict?season=2025&event=USNJCMPPKWY');
    fireEvent.click(await screen.findByRole('button', { name: /How accurate is this/ }));
    expect(await screen.findByText('Advancement odds before the event')).toBeInTheDocument();
    expect(screen.getByText('No recorded match calls have been played yet.')).toBeInTheDocument();
  });

  it('explains warm-up and unsupported events instead of erroring', async () => {
    scout.fetchScoutTeam.mockResolvedValue(profile([ev('FPERR', 'Premier', '2099-05-28')]));
    predict.fetchForecast.mockRejectedValue(new PredictError('This championship is split into divisions.', 422));
    renderPage();
    expect(await screen.findByText(/split into divisions/)).toBeInTheDocument();
    cleanup();
    predict.fetchForecast.mockRejectedValue(new PredictError('warming', 503));
    renderPage();
    expect(await screen.findByText(/warming up/i)).toBeInTheDocument();
  });

  it('sends teams without an FTC number to the workspace settings', async () => {
    scout.fetchScoutTeam.mockRejectedValue(Object.assign(new Error('No FTC team set for this workspace'), { status: 404 }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Go to Settings/ }));
    expect(loc).toBe('/settings?section=workspace');
  });
});
