// Small coloured text in the kit reaches WCAG AA (4.5:1) in both themes: the link button and the destructive
// menu item. Their light-theme colours used to be volt #eab308 (1.9:1 on white) and rose 500 (3.7:1).
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '..';

afterEach(cleanup);

const css = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const index = css('../../../index.css'), modern = css('../../../modern/modern.css');
/** A custom property's value in the first block opened by `selector`. */
function prop(src: string, selector: string, name: string) {
  const i = src.indexOf(selector);
  const body = src.slice(i, src.indexOf('}', i));
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(body);
  if (i < 0 || !m) throw new Error(`${name} not in ${selector}`);
  return m[1].trim();
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** color-mix(in srgb, <accent> p%, black), as the browser computes it. */
const towardBlack = (c: RGB, p: number) => c.map((v) => Math.round(v * p)) as RGB;

describe('kit text contrast', () => {
  it('link buttons use the accent text colour, which holds on white for volt and for a light team colour', () => {
    render(<Button variant="link">Connect</Button>);
    expect(screen.getByRole('button', { name: 'Connect' }).className).toMatch(/(^|\s)text-accent-text(\s|$)/);

    const mix = /^color-mix\(in srgb, var\(--color-accent\) (\d+)%, black\)/.exec(prop(index, 'html.light {', '--color-accent-text'));
    expect(mix, 'light --color-accent-text darkens the accent').not.toBeNull();
    const p = Number(mix![1]) / 100;
    const white: RGB = [255, 255, 255];
    for (const accent of [prop(index, 'html.light {', '--color-accent'), '#22d3ee', '#a3e635', '#f472b6']) {
      expect(ratio(towardBlack(hex(accent), p), white), accent).toBeGreaterThanOrEqual(4.5);
    }
    // Dark: the accent itself on the darkest card.
    expect(ratio(hex(prop(index, '@theme', '--color-accent')), hex('#1a1a1f'))).toBeGreaterThanOrEqual(4.5);
  });

  it('destructive menu items use the destructive text colour, readable on the popover and on their focus tint', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem variant="destructive">Delete</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>,
    );
    const cls = screen.getByRole('menuitem', { name: 'Delete' }).className;
    expect(cls).toMatch(/(^|\s)text-destructive-text(\s|$)/);
    const tint = /focus:bg-rose-500\/(\d+)/.exec(cls);
    expect(tint, 'the focus tint this test measures').not.toBeNull();
    const a = Number(tint![1]) / 100, rose500 = hex('#ff2056'); // Tailwind 4's rose 500 as the browser computes it
    const onTint = (bg: RGB) => bg.map((v, i) => Math.round(rose500[i] * a + v * (1 - a))) as RGB;
    const cases: [string, RGB, RGB][] = [
      // Light: the html.light token on the white popover.
      ['light', hex(prop(index, 'html.light {', '--color-destructive-text')), hex(prop(modern, 'html.light[data-ui="modern"] {', '--sh-popover'))],
      // Dark: the token is the destructive colour itself.
      ['dark', hex(prop(modern, 'html[data-ui="modern"] {', '--sh-destructive')), hex(prop(modern, 'html[data-ui="modern"] {', '--sh-popover'))],
    ];
    expect(prop(index, '@theme', '--color-destructive-text')).toBe('var(--color-destructive)');
    for (const [theme, fg, bg] of cases) {
      expect(ratio(fg, bg), `${theme} at rest`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fg, onTint(bg)), `${theme} focused`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
