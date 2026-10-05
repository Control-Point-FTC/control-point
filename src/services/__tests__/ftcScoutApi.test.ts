import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createTtlCache, readRecentTeams, pushRecentTeam, SCOUT_TTL_MS } from '../ftcScoutApi';
import { setScoutingContext, getScoutingContext, subscribeScoutingContext, openBruno, BRUNO_OPEN_EVENT, ANALYZE_GREETING, type BrunoOpenDetail } from '../brunoContext';
import { useDebounced } from '../../hooks/useDebounced';
import type { ShortlistEntry } from '../../types/ftcScout';
import { applyShortlistPatch, mergeStampedDelete, mergeStampedPatch } from '../../utils/shortlist';

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

describe('applyShortlistPatch (field-level shortlist edits)', () => {
  const base: ShortlistEntry = { teamNumber: 7, teamName: 'T7', season: 2025, eventCode: null, notes: 'fast auto', priority: 'medium', scoutNext: false, strengths: ['Auto'], weaknesses: [], updatedAt: '' };
  it('creates an entry with defaults', () => {
    const e = applyShortlistPatch(null, { season: 2025, teamNumber: 9, teamName: 'Nine' }, 'now');
    expect(e).toMatchObject({ teamNumber: 9, teamName: 'Nine', priority: 'medium', notes: '', strengths: [], updatedAt: 'now' });
  });
  it('changes only the fields in the patch, so concurrent edits of different fields both survive', () => {
    const a = applyShortlistPatch(base, { season: 2025, teamNumber: 7, priority: 'high' }, 't1');
    const b = applyShortlistPatch(a, { season: 2025, teamNumber: 7, notes: 'drops samples' }, 't2');
    expect(b).toMatchObject({ priority: 'high', notes: 'drops samples', strengths: ['Auto'] });
  });
  it('adds and removes tags without clobbering other tags (deduped, max 10, trimmed)', () => {
    const a = applyShortlistPatch(base, { season: 2025, teamNumber: 7, addStrengths: [' Endgame ', 'Auto'] }, 't');
    expect(a.strengths).toEqual(['Auto', 'Endgame']);
    const b = applyShortlistPatch(a, { season: 2025, teamNumber: 7, removeStrengths: ['Auto'], addWeaknesses: ['Penalties'] }, 't');
    expect(b.strengths).toEqual(['Endgame']);
    expect(b.weaknesses).toEqual(['Penalties']);
    const many = applyShortlistPatch(base, { season: 2025, teamNumber: 7, addStrengths: Array.from({ length: 20 }, (_, i) => `t${i}`) }, 't');
    expect(many.strengths).toHaveLength(10);
  });
  it('ignores invalid priorities and caps notes', () => {
    const e = applyShortlistPatch(base, { season: 2025, teamNumber: 7, priority: 'urgent' as never, notes: 'x'.repeat(3000) }, 't');
    expect(e.priority).toBe('medium');
    expect(e.notes).toHaveLength(2000);
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

describe('shortlist write ordering (server merge)', () => {
  const e0: ShortlistEntry = { teamNumber: 7, teamName: 'T7', season: 2025, eventCode: null, notes: 'old', priority: 'medium', scoutNext: false, strengths: [], weaknesses: [], updatedAt: '' };
  const A = (seq: number) => ({ client: 'tab-aaaaaaaa', seq });
  const B = (seq: number) => ({ client: 'tab-bbbbbbbb', seq });
  const live = (stamps = {}) => ({ entry: e0, stamps, deleted: false });
  const P = { season: 2025, teamNumber: 7 };

  it("ignores a client's own older request that arrives late, field by field", () => {
    const newer = mergeStampedPatch(live(), { ...P, notes: 'new' }, A(2), 't')!;
    const late = mergeStampedPatch({ ...live(newer.stamps), entry: newer.entry }, { ...P, notes: 'stale', priority: 'high' }, A(1), 't')!;
    expect(late.entry.notes).toBe('new');
    expect(late.entry.priority).toBe('high');
  });

  it('applies other members in arrival order, regardless of their sequence numbers', () => {
    const a = mergeStampedPatch(live(), { ...P, notes: 'from A' }, A(50), 't')!;
    const b = mergeStampedPatch({ ...live(a.stamps), entry: a.entry }, { ...P, notes: 'from B' }, B(1), 't')!;
    expect(b.entry.notes).toBe('from B');
  });

  it('per-tag ordering: a late add cannot undo the same client\'s newer remove', () => {
    const add = mergeStampedPatch(live(), { ...P, addStrengths: ['Auto'] }, A(1), 't')!;
    const rm = mergeStampedPatch({ ...live(add.stamps), entry: add.entry }, { ...P, removeStrengths: ['Auto'] }, A(3), 't')!;
    const lateAdd = mergeStampedPatch({ ...live(rm.stamps), entry: rm.entry }, { ...P, addStrengths: ['Auto'] }, A(2), 't')!;
    expect(lateAdd.entry.strengths).toEqual([]);
  });

  it('a late save cannot resurrect what its client deleted; stamps survive re-add', () => {
    const notes = mergeStampedPatch(live(), { ...P, notes: 'x' }, A(5), 't')!;
    const stamps = mergeStampedDelete({ ...live(notes.stamps), entry: notes.entry }, A(6))!;
    const dead = { entry: notes.entry, stamps, deleted: true };
    expect(mergeStampedPatch(dead, { ...P, notes: 'late' }, A(4), 't')).toBeNull();
    const readd = mergeStampedPatch(dead, { ...P, teamName: 'T7' }, B(1), 't')!;
    expect(readd.entry.notes).toBe('');
    const lateNotes = mergeStampedPatch({ entry: readd.entry, stamps: readd.stamps, deleted: false }, { ...P, notes: 'pre-delete' }, A(3), 't')!;
    expect(lateNotes.entry.notes).toBe('');
  });

  it("ignores a client's late delete after its own newer edit", () => {
    const edit = mergeStampedPatch(live(), { ...P, notes: 'keep' }, A(9), 't')!;
    expect(mergeStampedDelete({ ...live(edit.stamps), entry: edit.entry }, A(8))).toBeNull();
    expect(mergeStampedDelete({ ...live(edit.stamps), entry: edit.entry }, B(1))).not.toBeNull();
  });
});
