import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PitDisplayPage, agendaPage, isOnNow, matchTime, EVENTS_PER_PAGE, type PitData } from '../pages/pit/PitDisplayPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
const data: PitData = {
  team: { name: 'Gluten Free', number: 11115 },
  timeZone: 'UTC',
  today,
  events: [{ id: 1, title: 'Build night', date: today, start_time: '18:00', end_time: '20:00', location: 'Shop', event_type: 'meeting' }],
  announcements: [{ text: 'Bring safety glasses', by: 'Ada', at: new Date().toISOString() }],
  checkin: { url: 'https://example.test/checkin/abc', code: 'K7Q2', expiresAt: new Date(Date.now() + 3600_000).toISOString() },
  match: { event: 'NJ Qualifier', next: { label: 'Q-12', time: null, alliance: 'blue', partners: [7], opponents: [5, 6] }, last: { label: 'Q-4', time: null, alliance: 'red', partners: [2], opponents: [3, 4], result: { us: 80, them: 60, outcome: 'W' } } },
};

describe('Pit display', () => {
  it('shows the week, the next match, check-in and announcements without signing in', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => data }));
    vi.stubGlobal('fetch', fetch);
    render(<PitDisplayPage token="tok_abcdefghijklmnopqrstuvwxyz" />);
    expect(await screen.findByRole('heading', { name: /Gluten Free/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/pit/tok_abcdefghijklmnopqrstuvwxyz', expect.anything());
    expect(screen.getByText('Build night')).toBeInTheDocument();
    expect(screen.getByText('Q-12')).toBeInTheDocument();
    expect(screen.getByText(/Won 80–60/)).toBeInTheDocument();
    expect(screen.getByText('K7Q2')).toBeInTheDocument();
    expect(screen.getByText('Bring safety glasses')).toBeInTheDocument();
  });

  it('says plainly when the link was turned off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'This display link was turned off or replaced' }) })));
    render(<PitDisplayPage token="tok_abcdefghijklmnopqrstuvwxyz" />);
    expect(await screen.findByText(/Pit display unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/turned off or replaced/)).toBeInTheDocument();
  });

  it('the link is a known route and stays open for signed-in viewers (no redirect home)', async () => {
    const { isKnownRoute } = await import('../../utils/publicRoutes');
    expect(isKnownRoute('/pit/tok_abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(isKnownRoute('/pit/short')).toBe(false);
    const { ALWAYS_REACHABLE_PAGES } = await import('../../App');
    expect(ALWAYS_REACHABLE_PAGES).toContain('pit');
  });

  it('a busy week pages through every event; an expired check-in is hidden', async () => {
    const many = Array.from({ length: 13 }, (_, i) => i);
    expect(agendaPage(many, 0)).toMatchObject({ list: many.slice(0, EVENTS_PER_PAGE), page: 0, pages: 3 });
    expect(agendaPage(many, 12_000).list).toEqual(many.slice(EVENTS_PER_PAGE, 2 * EVENTS_PER_PAGE));
    expect(agendaPage(many, 24_000).list).toEqual([12]);
    expect(agendaPage([], 5).pages).toBe(1);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...data, checkin: { ...data.checkin!, expiresAt: new Date(Date.now() - 1000).toISOString() } }) })));
    render(<PitDisplayPage token="tok_abcdefghijklmnopqrstuvwxyz" />);
    expect(await screen.findByText('Build night')).toBeInTheDocument();
    expect(screen.queryByText('K7Q2')).toBeNull();
  });

  it('match times: in the team zone when they carry an offset, else as written', () => {
    expect(matchTime('2026-12-05T14:30:00Z', 'America/New_York')).toMatch(/9:30/);
    expect(matchTime('2026-12-05T14:30:00', 'America/New_York')).toMatch(/2:30/);
  });

  it('marks what is on now (an event with no end counts as an hour)', () => {
    const e = { date: today, start_time: '18:00', end_time: '20:00' };
    expect(isOnNow(e, today, '19:30')).toBe(true);
    expect(isOnNow(e, today, '20:00')).toBe(false);
    expect(isOnNow({ ...e, end_time: null }, today, '18:59')).toBe(true);
    expect(isOnNow({ ...e, end_time: null }, today, '19:00')).toBe(false);
    expect(isOnNow({ ...e, start_time: null }, today, '19:00')).toBe(false);
    expect(isOnNow(e, '2000-01-01', '19:00')).toBe(false);
  });
});
