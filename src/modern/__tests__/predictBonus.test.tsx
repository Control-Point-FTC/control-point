// Engine 2.3 bonus ranking point odds on the Predict tab's match rows: expected RPs with a tier, each bonus on open.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchesTab } from '../pages/predict/PredictTabs';
import { callPct } from '../pages/predict/BonusOdds';
import type { ForecastView } from '../../services/predictApi';

const bonus = { red: [0.62, 0.004, 0.31], blue: [0.55, 0.12, 0.999], expectedRpRed: 3.12, expectedRpBlue: 1.97, tier: 'moderate', reason: 'The least-known robot has 5 matches this season.' };
const upcoming = (b: unknown) => ({ key: 'Q1', label: 'Q1', level: 'qual', red: [1, 2], blue: [3, 4], pRedWin: 0.62, redMean: 120, blueMean: 100, played: null, bonus: b });
const show = (season: number, matches: unknown[]) =>
  render(<MemoryRouter><MatchesTab fc={{ season, matches } as unknown as ForecastView} myTeam={null} /></MemoryRouter>);

afterEach(() => cleanup());

describe('Predict matches: bonus ranking points', () => {
  it("shows expected RPs, the tier and every bonus in the season's names", () => {
    show(2026, [upcoming(bonus)]);
    const card = screen.getByTestId('bonus-odds');
    expect(card.textContent).toContain('3.1');
    expect(card.textContent).toContain('2.0');
    expect(within(card).getByText('Moderate').getAttribute('title')).toContain('least-known robot');
    for (const l of ['Swarm', 'Pollinator 1', 'Pollinator 2']) expect(within(card).getByText(l)).toBeTruthy();
    expect(within(card).getByRole('img', { name: 'Red 62%' })).toBeTruthy();
  });

  it('never shows a flat 0% or 100%', () => {
    expect(callPct(0.004)).toBe('1%');
    expect(callPct(0.999)).toBe('99%');
    show(2025, [upcoming(bonus)]);
    const card = screen.getByTestId('bonus-odds');
    expect(card.textContent).not.toMatch(/\b0%|100%/);
  });

  it('shows nothing for a match without bonus odds', () => {
    show(2025, [upcoming(null)]);
    expect(screen.queryByTestId('bonus-odds')).toBeNull();
  });
});
