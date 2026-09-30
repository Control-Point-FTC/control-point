/**
 * Bulk outreach paste parser — deterministic (non-AI) row parsing.
 * Covers spreadsheet-style tab pastes, pipe-delimited rows, header-mapped
 * tables, and freeform lines with sniffed dates/hours/attendees/funds.
 */
import { describe, it, expect } from 'vitest';
import { parseOutreachRows } from '../../../App';

describe('parseOutreachRows', () => {
  it('parses pipe-delimited rows with sniffed fields', () => {
    const rows = parseOutreachRows(
      'Robotics demo | 2026-09-12 | 2 | River Edge Library | 40 attendees\n' +
      'STEM workshop | 2026-09-18 | 3h | NJIT | $250 raised'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: 'Robotics demo', date: '2026-09-12', hours: '2',
      location: 'River Edge Library', attendees: '40',
    });
    expect(rows[1]).toMatchObject({
      title: 'STEM workshop', date: '2026-09-18', hours: '3', funds_raised: '250',
    });
  });

  it('parses tab-delimited spreadsheet pastes with a header row', () => {
    const rows = parseOutreachRows(
      'Title\tDate\tHours\tLocation\tAttendees\tFunds Raised\n' +
      'Library demo\t09/12/2026\t2\tRiver Edge Library\t40\t250\n' +
      'Food drive\tSep 18, 2026\t3\tCommunity Center\t25\t0'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: 'Library demo', date: '2026-09-12', hours: '2',
      location: 'River Edge Library', attendees: '40', funds_raised: '250',
    });
    expect(rows[1]).toMatchObject({ title: 'Food drive', date: '2026-09-18', hours: '3' });
  });

  it('normalizes month-name and slash dates', () => {
    const rows = parseOutreachRows('Demo | Sep 5 | 1 | Library');
    expect(rows[0].date).toMatch(/^\d{4}-09-05$/);
  });

  it('handles a bare number in the hours position', () => {
    const rows = parseOutreachRows('Demo | 2026-09-01 | 2 | Library');
    expect(rows[0].hours).toBe('2');
  });

  it('skips blank lines and caps at 50 rows', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Event ${i} | 2026-09-01 | 1 | Here`).join('\n');
    const rows = parseOutreachRows(`\n\n${text}\n\n`);
    expect(rows).toHaveLength(50);
  });

  it('returns [] for empty input', () => {
    expect(parseOutreachRows('')).toEqual([]);
    expect(parseOutreachRows('   \n  ')).toEqual([]);
  });

  it('treats a plain line as a title-only event dated today', () => {
    const rows = parseOutreachRows('Just a demo at the school');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Just a demo at the school');
    expect(rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
