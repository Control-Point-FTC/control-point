import { describe, it, expect } from 'vitest';
import { isKnownRoute, withHead, PUBLIC_HEADS, publicHeadFor } from '../publicRoutes';

describe('isKnownRoute', () => {
  it('accepts every app route, notebook deep links, join and check-in links', () => {
    for (const p of ['/', '/dashboard', '/tasks', '/tasks/', '/notebook', '/notebook/p/42', '/cad-parts', '/privacy', '/terms', '/join/cpi_x', '/checkin/AB12', '/predict/how-it-works']) {
      expect(isKnownRoute(p), p).toBe(true);
    }
  });
  it('matches like React Router: any letter case, optional trailing slash', () => {
    for (const p of ['/Tasks', '/SETTINGS/', '/Notebook/p/1']) expect(isKnownRoute(p), p).toBe(true);
    expect(publicHeadFor('/Privacy/')?.path).toBe('/privacy');
    expect(publicHeadFor('/dashboard')).toBeNull();
  });
  it('rejects unknown paths and sub-paths the app does not have', () => {
    for (const p of ['/nope', '/tasks/12', '/dashboardx', '/notebookx', '/join', '/checkin/a-b', '/privacy/old']) {
      expect(isKnownRoute(p), p).toBe(false);
    }
  });
});

describe('withHead', () => {
  const html = '<title>Home</title><meta name="description" content="d" /><meta property="og:title" content="Home" /><meta property="og:url" content="https://x/" />';
  it('replaces title, description and og tags, escaping HTML', () => {
    const out = withHead(html, { title: 'A <b> & "c"', description: 'x' }, 'https://x/terms');
    expect(out).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(out).toContain('<meta name="description" content="x" />');
    expect(out).toContain('<meta property="og:url" content="https://x/terms" />');
  });
  it('points the canonical link at the page, and a 404 claims no URL', () => {
    const page = html + '<link rel="canonical" href="https://x/" />';
    expect(withHead(page, { title: 'T', description: 'd' }, 'https://x/privacy')).toContain('<link rel="canonical" href="https://x/privacy" />');
    const notFound = withHead(page, { title: 'Page not found', description: 'd' });
    expect(notFound).not.toContain('canonical');
    expect(notFound).not.toContain('og:url');
  });
  it('has heads for both legal pages', () => {
    expect(Object.keys(PUBLIC_HEADS).sort()).toEqual(['/privacy', '/terms']);
  });
});
