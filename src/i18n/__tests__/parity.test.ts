import { describe, it, expect } from 'vitest';
import i18n from '../index';

// Control Point is English-only (V3): one translation set, always English,
// whatever language a device picked before.
describe('i18n (English only)', () => {
  it('ships only English and always uses it', () => {
    const langs = Object.keys((i18n as any).store?.data || {});
    expect(langs).toEqual(['en']);
    expect(i18n.language).toBe('en');
  });

  it('keys resolve to real text (no raw key paths shown)', () => {
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    expect(i18n.t('settings.lightMode')).not.toBe('settings.lightMode');
  });
});
