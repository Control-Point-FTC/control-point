import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Countdown } from '../ui/Countdown';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('<Countdown>', () => {
  it('ticks every second and turns into "Overdue by" once past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T15:29:58'));
    render(<Countdown to={new Date('2026-10-09T15:30:00')} />);
    expect(screen.getByRole('timer')).toHaveTextContent('in 00:00:02');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('timer')).toHaveTextContent('in 00:00:01');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('timer')).toHaveTextContent('Overdue by 00:00:02');
  });
});
