// Counts a visit to a public page (home, privacy, terms) with the site's
// own cookieless counter. Nothing is stored in the browser, and nothing is
// sent when the visitor asks not to be tracked.
import { useEffect } from 'react';

export function countPublicPageView(path: string) {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return;
    void fetch('/api/pv', { method: 'POST', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-CP-Client': '1' }, body: JSON.stringify({ path }) }).catch(() => undefined);
  } catch { /* counting is never worth an error */ }
}

/** Counts only when the address bar really shows that public page (the
 *  landing page also appears, signed out, at private addresses). */
export function usePublicPageView(path: string) {
  useEffect(() => {
    const here = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    if (here === path) countPublicPageView(path);
  }, [path]);
}
