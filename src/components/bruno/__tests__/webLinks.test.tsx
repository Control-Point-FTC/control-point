import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrunoMarkdown, linkDomain } from '../../BrunoMarkdown';
afterEach(cleanup);
const show = (text: string) => render(<MemoryRouter><BrunoMarkdown>{text}</BrunoMarkdown></MemoryRouter>);

describe('external links in Bruno replies', () => {
  it('open directly in a new tab, without access to the app, and show their site', () => {
    show('See the [UltraPlanetary gearbox](https://www.revrobotics.com/rev-41-1600/).');
    const link = screen.getByRole('link', { name: /UltraPlanetary gearbox/ });
    expect(link.getAttribute('href')).toBe('https://www.revrobotics.com/rev-41-1600/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe('UltraPlanetary gearbox(revrobotics.com)');
  });
  it("don't repeat a site already in the link text, and leave mail links alone", () => {
    show('[revrobotics.com/motors](https://revrobotics.com/motors) or [email us](mailto:team@example.org)');
    expect(screen.getByRole('link', { name: 'revrobotics.com/motors' }).textContent).toBe('revrobotics.com/motors');
    expect(screen.getByRole('link', { name: 'email us' }).textContent).toBe('email us');
  });
  it('reads the site from http(s) addresses only', () => {
    expect(linkDomain('https://www.gobilda.com/x')).toBe('gobilda.com');
    expect(linkDomain('mailto:a@b.c')).toBeNull();
    expect(linkDomain('not a url')).toBeNull();
  });
});

describe('formatted link text', () => {
  it("doesn't repeat a site already shown in bold or code", () => {
    show('[**revrobotics.com**](https://revrobotics.com) and [`gobilda.com/parts`](https://www.gobilda.com/parts) and [**Yellow Jacket**](https://www.gobilda.com/yj)');
    expect(screen.getByRole('link', { name: 'revrobotics.com' }).textContent).toBe('revrobotics.com');
    expect(screen.getByRole('link', { name: 'gobilda.com/parts' }).textContent).toBe('gobilda.com/parts');
    expect(screen.getByRole('link', { name: /Yellow Jacket/ }).textContent).toBe('Yellow Jacket(gobilda.com)');
  });
});
