import { describe, it, expect } from 'vitest';
import { filterEntries, groupEntries, weekLabel, type JournalEntry } from '../NotebookJournal';

const e = (id: number, date: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, title: `Entry ${id}`, sectionId: 1, sectionTitle: 'Build', date, workDate: null, createdAt: date, updatedAt: date,
  excerpt: '', readMinutes: 1, type: null, stage: null, subsystems: [], awards: [], authors: ['Ana'], ...extra,
});

describe('notebook journal grouping', () => {
  it('labels weeks relative to today', () => {
    expect(weekLabel('2026-10-15', '2026-10-17')).toBe('This week'); // Thu, same Sunday-started week
    expect(weekLabel('2026-10-10', '2026-10-17')).toBe('Last week');
    expect(weekLabel('2026-09-29', '2026-10-17')).toMatch(/^Week of Sep 27/);
  });
  it('groups by week in order, or by award with the rest last', () => {
    const list = [e(1, '2026-10-16', { awards: ['think'] }), e(2, '2026-10-12'), e(3, '2026-10-05', { awards: ['think', 'innovate'] })];
    expect(groupEntries(list, 'week', '2026-10-17').map((g) => [g.label, g.entries.map((x) => x.id)])).toEqual([['This week', [1, 2]], ['Last week', [3]]]);
    expect(groupEntries(list, 'award', '2026-10-17').map((g) => [g.label, g.entries.map((x) => x.id)])).toEqual([['Think', [1, 3]], ['Innovate', [3]], ['No award tagged', [2]]]);
  });
  it('filters by type, stage, subsystem and author', () => {
    const list = [e(1, '2026-10-16', { type: 'test', subsystems: ['Intake'] }), e(2, '2026-10-12', { type: 'build', authors: ['Lee'] })];
    expect(filterEntries(list, { type: 'test', stage: '', subsystem: '', author: '' }).map((x) => x.id)).toEqual([1]);
    expect(filterEntries(list, { type: '', stage: '', subsystem: 'Intake', author: '' }).map((x) => x.id)).toEqual([1]);
    expect(filterEntries(list, { type: '', stage: '', subsystem: '', author: 'Lee' }).map((x) => x.id)).toEqual([2]);
  });
});

import { vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { NotebookJournal } from '../NotebookJournal';
import * as api from '../../services/api';

describe('Load older entries', () => {
  it('a double click loads the next page once, with no repeated cards', async () => {
    const calls: string[] = [];
    let release!: (v: any) => void;
    const spy = vi.spyOn(api, 'apiJson').mockImplementation(((url: string) => {
      calls.push(url);
      if (url.includes('offset=0')) return Promise.resolve({ entries: [e(1, '2026-10-16')], more: true, nextOffset: 1, facets: { authors: [], subsystems: [] } });
      return new Promise((r) => { release = r; });
    }) as any);
    render(<NotebookJournal open onClose={() => {}} onOpenPage={() => {}} teamId={1} />);
    const button = await screen.findByRole('button', { name: 'Load older entries' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls.filter((u) => u.includes('offset=1'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Loading older entries/ })).toBeDisabled();
    await act(async () => { release({ entries: [e(2, '2026-10-01')], more: false, nextOffset: 2 }); });
    expect(screen.getAllByText('Entry 2')).toHaveLength(1);
    spy.mockRestore();
    cleanup();
  });
});
