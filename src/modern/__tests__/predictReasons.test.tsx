// Engine recent-record reasons on the Predict tab's upcoming match rows, from Control Scout's reliability data.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ForecastView } from '../../services/predictApi';

const recent = new Map([[1, { matches: 10, noShows: 2, nearZero: 0 }], [4, { matches: 10, noShows: 0, nearZero: 3 }]]);
vi.mock('../../services/reliabilityApi', () => ({
  useReliability: () => ({ by: new Map([...recent].map(([team, r]) => [team, { team, index: 50, matches: 10, noShows: r.noShows, dqs: 0, nearZero: r.nearZero, recent: r }])), fieldIndex: 75 }),
}));
const { MatchesTab } = await import('../pages/predict/PredictTabs');

const m = (key: string, played: { red: number; blue: number } | null) =>
  ({ key, label: key, level: 'qual', red: [1, 2], blue: [3, 4], pRedWin: 0.4, redMean: 80, blueMean: 90, redBand: null, blueBand: null, played });
const show = (matches: unknown[]) =>
  render(<MemoryRouter><MatchesTab fc={{ season: 2025, matches } as unknown as ForecastView} myTeam={null} /></MemoryRouter>);

afterEach(() => cleanup());

describe('Predict matches: recent-record reasons', () => {
  it('lists the engine reasons under an upcoming match', () => {
    show([m('Q1', null)]);
    const r = screen.getByTestId('match-reasons');
    expect(r.textContent).toContain('Team 1 was a no-show in 2 of its last 10 matches');
    expect(r.textContent).toContain("Team 4's alliance scored about what its partner alone would in 3 of its last 10 matches");
  });

  it('adds nothing to played matches', () => {
    show([m('Q2', { red: 50, blue: 60 })]);
    expect(screen.queryByTestId('match-reasons')).toBeNull();
  });
});
