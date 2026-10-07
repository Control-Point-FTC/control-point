import { describe, it, expect } from 'vitest';
import { toCsv, datedName } from '../csv';

describe('CSV export', () => {
  const cols = [
    { header: 'Name', value: (r: any) => r.name },
    { header: 'Amount', value: (r: any) => r.amount },
  ];

  it('quotes commas, quotes and newlines; starts with a BOM; CRLF lines', () => {
    const out = toCsv([{ name: 'Gears, "big"', amount: 12.5 }, { name: 'two\nlines', amount: null }], cols);
    expect(out.startsWith('\ufeff')).toBe(true);
    expect(out).toBe('\ufeffName,Amount\r\n"Gears, ""big""",12.5\r\n"two\nlines",\r\n');
  });

  it('neutralises spreadsheet formulas (CSV injection)', () => {
    const out = toCsv([{ name: '=HYPERLINK("http://x")', amount: 1 }, { name: '+1+1', amount: 2 }, { name: '@SUM(A1)', amount: 3 }, { name: '-5', amount: -5 }], cols);
    const lines = out.replace('\ufeff', '').split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"")",1`);
    expect(lines[2]).toBe("'+1+1,2");
    expect(lines[3]).toBe("'@SUM(A1),3");
    expect(lines[4]).toBe("'-5,-5"); // text that looks like a formula is escaped; real numbers aren't
  });

  it('booleans and dates', () => {
    expect(toCsv([{ name: true, amount: Infinity }], cols)).toBe('\ufeffName,Amount\r\nyes,\r\n');
    // Local date, even where the UTC date has already rolled over.
    const lateEvening = new Date(2026, 9, 7, 23, 30); // Oct 7, 23:30 local
    expect(datedName('budget', lateEvening)).toBe('budget-2026-10-07.csv');
  });
});
