import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
vi.mock('../../../services/ftcScoutApi', async (orig) => ({ ...(await orig<object>()), fetchScoutTeam: vi.fn(() => new Promise(() => {})) }));
import { useTeamStats } from '../useTeamStats';
import { currentFtcSeason } from '../../FtcStats';

const at = (url: string) => ({ wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> });

describe('season from a link', () => {
  it('keeps any season a scouting entry can have, back to 2015', () => {
    expect(renderHook(() => useTeamStats(), at('/stats?mode=scout&season=2016')).result.current.season).toBe(2016);
  });
  it('ignores a malformed season', () => {
    expect(renderHook(() => useTeamStats(), at('/stats?season=1999')).result.current.season).toBe(currentFtcSeason());
    expect(renderHook(() => useTeamStats(), at('/stats?season=abc')).result.current.season).toBe(currentFtcSeason());
  });
});
