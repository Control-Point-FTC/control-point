import { describe, it, expect } from 'vitest';
import { changelogEntryFrom, changelogDiscordText, compareVersions } from '../changelog';

describe('owner changelog entries', () => {
  it('sorts versions numerically, newest first', () => {
    expect(['2.0.0', '3.10', '3.5.0', '3.5.1'].sort(compareVersions)).toEqual(['3.10', '3.5.1', '3.5.0', '2.0.0']);
  });
  it('cleans lines and validates', () => {
    const ok = changelogEntryFrom({ version: 'V3.6', date: '2026-10-09', title: ' Notebook ', added: '• One\n\n- Two', improved: ['  '], fixed: [] });
    expect(ok).toEqual({ entry: { version: '3.6', date: '2026-10-09', title: 'Notebook', added: ['One', 'Two'], improved: [], fixed: [] } });
    expect(changelogEntryFrom({ version: '3.6', date: 'soon', title: 'x', added: ['a'] })).toEqual({ error: 'Pick a release date' });
    expect(changelogEntryFrom({ version: '3.6', date: '2026-10-09', title: 'x' })).toEqual({ error: 'Add at least one change' });
  });
  it('formats for Discord under 2000 characters', () => {
    const text = changelogDiscordText({ version: '3.6.0', date: '2026-10-09', title: 'Notebook', added: ['A'], improved: [], fixed: Array(60).fill('x'.repeat(60)) });
    expect(text.startsWith('**Control Point v3.6.0: Notebook** (Oct 9, 2026)')).toBe(true);
    expect(text).toContain('✨ **New**\n• A');
    expect(text).not.toContain('Improved');
    expect(text.length).toBeLessThanOrEqual(2000);
  });
});
