import { describe, it, expect } from 'vitest';
import i18n from '../index';

// Control Point is English-only (V3): one translation set, always English,
// whatever language a device picked before.

/** Every leaf (key path → value) of a nested translation object. */
function leaves(obj: any, prefix = ''): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leaves(v, path));
    else out.push([path, v]);
  }
  return out;
}

describe('i18n (English only)', () => {
  it('ships only English and always uses it', () => {
    const langs = Object.keys((i18n as any).store?.data || {});
    expect(langs).toEqual(['en']);
    expect(i18n.language).toBe('en');
  });

  it('every English string has text (no blank labels)', () => {
    const all = leaves((i18n as any).store.data.en.translation);
    expect(all.length).toBeGreaterThan(50);
    const blank = all.filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
    expect(blank).toEqual([]);
  });

  it('keys resolve to their text', () => {
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    expect(i18n.t('settingsPage.appearanceHint')).toBe('Light or dark theme');
  });
});
