import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createTtlCache, upsertLocal, readRecentTeams, pushRecentTeam, SCOUT_TTL_MS } from '../ftcScoutApi';
import { setScoutingContext, getScoutingContext, subscribeScoutingContext, openBruno, BRUNO_OPEN_EVENT, ANALYZE_GREETING, type BrunoOpenDetail } from '../brunoContext';
import { useDebounced } from '../../hooks/useDebounced';
import type { ShortlistEntry } from '../../types/ftcScout';

describe('createTtlCache', () => {
  it('caches for the TTL (10 minutes) and reloads after expiry', async () => {
    let t = 0;
    const cache = createTtlCache<number>(SCOUT_TTL_MS, () => t);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.get('k', load)).toBe(1);
    t = SCOUT_TTL_MS - 1;
    expect(await cache.get('k', load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    t = SCOUT_TTL_MS + 1;
    expect(cache.peek('k')).toBeNull();
    expect(await cache.get('k', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates concurrent loads of the same key', async () => {
    const cache = createTtlCache<string>(1000);
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const a = cache.get('x', load);
    const b = cache.get('x', load);
    resolve('done');
    expect(await a).toBe('done');
    expect(await b).toBe('done');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('force bypasses the cache, and a superseded request does not overwrite it', async () => {
    const cache = createTtlCache<string>(1000);
    let slow!: (v: string) => void;
    const first = cache.get('x', () => new Promise<string>((r) => { slow = r; }));
    expect(await cache.get('x', async () => 'fresh', { force: true })).toBe('fresh');
    slow('old');
    await first;
    expect(cache.peek('x')).toBe('fresh');
  });

  it('does not cache failures', async () => {
    const cache = createTtlCache<number>(1000);
    await expect(cache.get('x', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache.get('x', async () => 5)).toBe(5);
  });

  it('invalidates by prefix or entirely', async () => {
    const cache = createTtlCache<number>(1000);
    await cache.get('2025:a', async () => 1);
    await cache.get('2024:a', async () => 2);
    cache.invalidate('2025:');
    expect(cache.peek('2025:a')).toBeNull();
    expect(cache.peek('2024:a')).toBe(2);
    cache.invalidate();
    expect(cache.size()).toBe(0);
  });
});

describe('upsertLocal (shortlist optimistic update)', () => {
  const e = (n: number, notes = ''): ShortlistEntry => ({ teamNumber: n, teamName: `T${n}`, season: 2025, eventCode: null, notes, priority: 'medium', scoutNext: false, strengths: [], weaknesses: [], updatedAt: '' });
  it('adds new teams and replaces existing ones in place', () => {
    const list = upsertLocal(upsertLocal([], e(1)), e(2));
    expect(list.map((x) => x.teamNumber)).toEqual([1, 2]);
    const next = upsertLocal(list, e(1, 'fast auto'));
    expect(next.map((x) => x.teamNumber)).toEqual([1, 2]);
    expect(next[0].notes).toBe('fast auto');
    expect(list[0].notes).toBe('');
  });
});

describe('recently viewed teams', () => {
  beforeEach(() => localStorage.clear());
  it('keeps the newest first, unique, capped at 8', () => {
    for (let i = 1; i <= 10; i++) pushRecentTeam({ number: i, name: `T${i}` });
    pushRecentTeam({ number: 5, name: 'T5' });
    const r = readRecentTeams();
    expect(r).toHaveLength(8);
    expect(r[0].number).toBe(5);
    expect(new Set(r.map((t) => t.number)).size).toBe(8);
  });
  it('survives corrupt storage', () => {
    localStorage.setItem('controlpoint-scout-recent', '{nope');
    expect(readRecentTeams()).toEqual([]);
  });
});

describe('useDebounced', () => {
  it('only updates after the value is stable', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ v: 'abc' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('abc');
    vi.useRealTimers();
  });
});

describe('Bruno scouting context', () => {
  it('stores the context and notifies only on change', () => {
    const l = vi.fn();
    const off = subscribeScoutingContext(l);
    setScoutingContext({ mode: 'analyze', season: 2025, eventCode: 'USNJCMP', selectedTeam: 4215 });
    setScoutingContext({ mode: 'analyze', season: 2025, eventCode: 'USNJCMP', selectedTeam: 4215 });
    expect(l).toHaveBeenCalledTimes(1);
    expect(getScoutingContext()?.selectedTeam).toBe(4215);
    setScoutingContext(null);
    expect(getScoutingContext()).toBeNull();
    expect(l).toHaveBeenCalledTimes(2);
    off();
  });

  it('openBruno dispatches the open event with the Analyze greeting', () => {
    const seen: BrunoOpenDetail[] = [];
    const h = (e: Event) => seen.push((e as CustomEvent<BrunoOpenDetail>).detail);
    window.addEventListener(BRUNO_OPEN_EVENT, h);
    openBruno({ greeting: ANALYZE_GREETING });
    window.removeEventListener(BRUNO_OPEN_EVENT, h);
    expect(seen[0].greeting).toMatch(/analyze teams, identify scouting priorities/);
  });
});
