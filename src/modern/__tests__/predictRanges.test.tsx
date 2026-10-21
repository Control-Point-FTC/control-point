// Engine 2.2 score ranges on the Predict tab's match rows: "85 ±43", explained for screen readers and on hover.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchesTab } from '../pages/predict/PredictTabs';
import type { ForecastView } from '../../services/predictApi';

const band = (lo: number, hi: number) => ({ level: 0.8, lo, hi, sd: 10 });
const upcoming = (key: string, redMean: number, blueMean: number, redBand: ReturnType<typeof band> | null, blueBand: ReturnType<typeof band> | null) =>
  ({ key, label: key, level: 'qual', red: [1, 2], blue: [3, 4], pRedWin: 0.4, redMean, blueMean, redBand, blueBand, played: null });
const show = (matches: unknown[]) =>
  render(<MemoryRouter><MatchesTab fc={{ matches } as unknown as ForecastView} myTeam={null} /></MemoryRouter>);

afterEach(() => cleanup());

describe('Predict matches: score ranges', () => {
  it('shows the predicted score with its ± and spells out the 80% range', () => {
    show([upcoming('Q1', 85.3, 246.9, band(42, 128), band(168, 326))]);
    const red = screen.getByTitle('80% range 42–128: about 8 in 10 real scores land inside');
    expect(red.textContent).toContain('85 ±43');
    expect(screen.getByText('(80% range 168–326: about 8 in 10 real scores land inside)').className).toContain('sr-only');
    expect(screen.getByTitle('80% range 168–326: about 8 in 10 real scores land inside').textContent).toContain('247 ±79');
  });

  it('quotes the larger side when a range is cut off at 0, and reaches both rounded bounds', () => {
    show([upcoming('Q2', 10.2, 100.4, band(0, 30), band(88, 113))]);
    expect(screen.getByTitle(/range 0–30:/).textContent).toContain('10 ±20');
    expect(screen.getByTitle(/88–113/).textContent).toContain('100 ±13');
  });

  it('a prediction with no band keeps the plain estimate', () => {
    show([upcoming('Q3', 120, 90, null, null)]);
    expect(screen.getByText('~120')).toBeTruthy();
    expect(screen.queryByText(/\d ±\d/)).toBeNull();
  });
});
