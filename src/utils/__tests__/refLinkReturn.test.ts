import { afterEach, describe, expect, it } from 'vitest';
import { isRefLinkPath, rememberRefLink, takeRefLink } from '../refLinkReturn';
afterEach(() => sessionStorage.clear());

describe('shared links across sign-in', () => {
  it('keeps a record link and opens it once after sign-in', () => {
    rememberRefLink('/t/3/task/42');
    expect(takeRefLink()).toBe('/t/3/task/42');
    expect(takeRefLink()).toBeNull();
  });
  it('never keeps anything but a well-formed record link', () => {
    for (const p of ['/dashboard', '//evil.example/t/1/task/1', '/t/3/task/42?next=https://evil.example', '/t/x/task/1', 'https://evil.example/t/1/task/1'])
      { rememberRefLink(p); expect(takeRefLink(), p).toBeNull(); }
    sessionStorage.setItem('pendingRefLink', '/settings');
    expect(takeRefLink()).toBeNull();
    expect(isRefLinkPath('/t/1/cad_part/9/')).toBe(true);
  });
});

describe('record links and the page guard', () => {
  it('lets signed-in people open /t/ links (the link page checks access itself)', async () => {
    const { ALWAYS_REACHABLE_PAGES } = await import('../../App');
    // The guard reads the first path segment: /t/3/task/42 → "t".
    expect(ALWAYS_REACHABLE_PAGES).toContain('/t/3/task/42'.split('/')[1]);
  });
  it('follows only the latest link opened before sign-in', async () => {
    const { forgetRefLink } = await import('../refLinkReturn');
    sessionStorage.setItem('pendingCheckinToken', 'AB12');
    rememberRefLink('/t/3/task/42');
    expect(sessionStorage.getItem('pendingCheckinToken')).toBeNull();
    forgetRefLink(); // a check-in link opened afterwards replaces it
    expect(takeRefLink()).toBeNull();
  });
});
