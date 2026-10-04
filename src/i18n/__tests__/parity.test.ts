import { describe, it, expect } from 'vitest';
import i18n from '../index';
import { SUPPORTED_LANGUAGES } from '../index';

/** Recursively collect all key paths from a nested object. */
function collectKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

/** Extract {{variable}} names from a string. */
function extractVars(str: string): string[] {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))].sort();
}

function getResource(lang: string): any {
  const store = (i18n as any).store?.data?.[lang]?.translation;
  if (!store) throw new Error(`No translations found for language: ${lang}`);
  return store;
}

describe('i18n translation parity', () => {
  const languages = SUPPORTED_LANGUAGES.map(l => l.code);
  const englishKeys = collectKeys(getResource('en'));

  it('every language has the same keys as English', () => {
    for (const lang of languages) {
      if (lang === 'en') continue;
      const keys = collectKeys(getResource(lang));
      const missing = englishKeys.filter(k => !keys.includes(k));
      const extra = keys.filter(k => !englishKeys.includes(k));
      expect(
        missing,
        `Language "${lang}" is missing keys: ${missing.join(', ')}`
      ).toEqual([]);
      expect(
        extra,
        `Language "${lang}" has extra keys not in English: ${extra.join(', ')}`
      ).toEqual([]);
    }
  });

  it('every language uses the same interpolation variables as English', () => {
    const enResource = getResource('en');
    for (const lang of languages) {
      if (lang === 'en') continue;
      const langResource = getResource(lang);
      for (const key of englishKeys) {
        const enVal = key.split('.').reduce((o: any, p) => o?.[p], enResource);
        const langVal = key.split('.').reduce((o: any, p) => o?.[p], langResource);
        if (typeof enVal !== 'string' || typeof langVal !== 'string') continue;
        const enVars = extractVars(enVal);
        const langVars = extractVars(langVal);
        expect(
          langVars,
          `Language "${lang}" key "${key}" has different interpolation variables. English: [${enVars}], ${lang}: [${langVars}]`
        ).toEqual(enVars);
      }
    }
  });

  it('no empty translation strings', () => {
    for (const lang of languages) {
      const resource = getResource(lang);
      for (const key of collectKeys(resource)) {
        const val = key.split('.').reduce((o: any, p) => o?.[p], resource);
        if (typeof val === 'string') {
          expect(val.trim(), `Language "${lang}" key "${key}" is empty`).not.toBe('');
        }
      }
    }
  });
});

describe('i18n language switching', () => {
  it('setLanguage persists to localStorage', async () => {
    const { setLanguage } = await import('../index');
    setLanguage('es');
    expect(localStorage.getItem('controlpoint-lang')).toBe('es');
    expect(i18n.language).toBe('es');
    // Restore
    setLanguage('en');
    expect(localStorage.getItem('controlpoint-lang')).toBe('en');
  });

  it('handles invalid language gracefully', async () => {
    const { setLanguage } = await import('../index');
    // Should not throw
    expect(() => setLanguage('xx-invalid')).not.toThrow();
    // Restore to valid
    setLanguage('en');
  });
});
