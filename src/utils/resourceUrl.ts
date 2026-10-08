// One key per web page, so the Resources library doesn't fill with copies of
// the same link (V3.5 phase 5). http/https, "www.", a trailing slash, a
// #fragment, tracking parameters and parameter order don't change the page;
// YouTube's short, mobile and embed links all name the same video. Pure:
// shared by the import preview and the server.

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|si|feature|_ga|yclid)$/i;

/** Comparison key for a URL; the trimmed input when it isn't a URL. */
export function resourceKey(raw: unknown): string {
  const s = String(raw ?? '').trim();
  let u: URL;
  try { u = new URL(s); } catch { return s.toLowerCase(); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return s.toLowerCase();
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  // YouTube: every form of a video link → its id.
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
      : u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/) || [])[1];
    if (id) return `youtube:${id}`;
  }
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  // Only a trailing slash is dropped (an inner "//" can name another page).
  const path = u.pathname.replace(/\/+$/, '');
  // URL already empties the scheme's default port; any other port is another server.
  const port = u.port ? `:${u.port}` : '';
  return `${host}${port}${path}${query}`;
}

export type DuplicateReason = 'saved' | 'repeat';

/** Split links into new ones and duplicates: 'saved' (the same page is in
 *  `existing`) or 'repeat' (an earlier link in the list). Order is kept. */
export function splitDuplicates<T extends { url: string }>(items: T[], existing: string[]): { fresh: T[]; duplicates: (T & { duplicate: DuplicateReason })[] } {
  const saved = new Set(existing.map(resourceKey));
  const seen = new Set<string>();
  const fresh: T[] = [];
  const duplicates: (T & { duplicate: DuplicateReason })[] = [];
  for (const it of items) {
    const k = resourceKey(it.url);
    if (saved.has(k)) duplicates.push({ ...it, duplicate: 'saved' });
    else if (seen.has(k)) duplicates.push({ ...it, duplicate: 'repeat' });
    else { seen.add(k); fresh.push(it); }
  }
  return { fresh, duplicates };
}
