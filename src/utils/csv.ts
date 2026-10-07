// CSV export (owner list: exports). Builds the file in the browser from data
// the page already has — nothing extra is sent to the server.
//
// Safe for spreadsheets: a cell that starts with = + - @ (or a tab/CR) is
// prefixed with ' so Excel/Sheets treat it as text, not a formula
// ("CSV injection"). Numbers stay numbers.

export interface CsvColumn<T> { header: string; value: (row: T) => unknown }

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  // BOM so Excel opens UTF-8 (names with accents) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "budget-2026-10-07.csv" */
export function datedName(base: string, d = new Date()): string {
  return `${base}-${d.toISOString().slice(0, 10)}.csv`;
}
