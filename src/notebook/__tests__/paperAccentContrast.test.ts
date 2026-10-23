import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The desktop page is white paper, so it darkens the accent. Filled accent
// buttons on it (review Submit, Approve) must switch their text color too.
const css = readFileSync(join(process.cwd(), 'src/notebook/notebook-desktop.css'), 'utf8');
const luminance = (hex: string) => {
  const full = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('notebook paper accent', () => {
  it('keeps text on filled accent buttons readable', () => {
    const rule = css.match(/\.nb-document\s*\{([^}]*)\}/)?.[1] ?? '';
    const accent = rule.match(/--color-accent:\s*(#[0-9a-f]{3,6})/i)?.[1];
    const ink = rule.match(/--color-accent-ink:\s*(#[0-9a-f]{3,6})/i)?.[1];
    expect(accent).toBeTruthy();
    expect(ink).toBeTruthy();
    expect(contrast(accent!, ink!)).toBeGreaterThanOrEqual(4.5);
  });
});
