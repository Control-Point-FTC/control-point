// Shared by the server (HTTP status + crawler-visible head tags) and the
// client (not-found page + document titles). Keep in sync with the <Route>
// list in App.tsx: a path missing here is answered with a 404 status.
// Matching is case-insensitive and ignores a trailing slash, like React Router.

const APP_SEGMENTS = [
  'dashboard', 'inbox', 'stats', 'predict', 'teams', 'roles', 'attendance', 'tasks', 'calendar',
  'budget', 'inventory', 'outreach', 'code', 'cad', 'cad-docs', 'cad-reviews', 'cad-snapshots',
  'cad-parts', 'comm', 'chat', 'resources', 'bruno', 'profile', 'settings', 'owner', 'privacy', 'terms',
];

const KNOWN = [
  /^\/$/,
  new RegExp(`^/(${APP_SEGMENTS.join('|')})/?$`, 'i'),
  /^\/notebook(\/.*)?$/i,
  /^\/checkin\/[A-Za-z0-9]+\/?$/i,
  /^\/join\/[^/]+\/?$/i,
  // Stable record links: /t/<team>/<type>/<id>.
  /^\/t\/\d+\/[a-z_]+\/\d+\/?$/i,
  /^\/predict\/how-it-works$/,
];

/** True when the SPA (or a server page) has something to show at `pathname`. */
export function isKnownRoute(pathname: string): boolean {
  return KNOWN.some((re) => re.test(pathname));
}

export type PublicHead = { title: string; description: string };

export const SITE_NAME = 'Control Point';

/** Crawler-visible head tags for the public (signed-out) pages. Signed-in
 *  routes never get route-specific tags, so team data can't reach previews. */
export const PUBLIC_HEADS: Record<string, PublicHead> = {
  '/privacy': {
    title: 'Privacy Policy · Control Point',
    description: 'How Control Point collects, uses and protects information for robotics teams, including AI features, files and connected accounts.',
  },
  '/terms': {
    title: 'Terms of Service · Control Point',
    description: 'The terms for using Control Point, the team workspace for robotics clubs: accounts, team content, acceptable use and AI features.',
  },
};

/** The public page head for a path, if it has one ("/Privacy/" -> privacy). */
export function publicHeadFor(pathname: string): { path: string; head: PublicHead } | null {
  const path = (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname).toLowerCase();
  return PUBLIC_HEADS[path] ? { path, head: PUBLIC_HEADS[path] } : null;
}

/** index.html's title: the signed-out home page. */
export const HOME_TITLE = 'Control Point — AI-powered mission control for your robotics team';

export const NOT_FOUND_HEAD: PublicHead = {
  title: 'Page not found · Control Point',
  description: 'This page does not exist. Head back to Control Point, mission control for your robotics team.',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Swap the title/description (and their og:/twitter: copies) in index.html. */
export function withHead(html: string, head: PublicHead, url?: string): string {
  const t = escapeHtml(head.title);
  const d = escapeHtml(head.description);
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`);
  // Each public page is its own canonical URL; a 404 claims none.
  if (url) out = out
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeHtml(url)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(url)}$2`);
  else out = out.replace(/\s*<meta property="og:url"[^>]*>/, '').replace(/\s*<link rel="canonical"[^>]*>/, '');
  return out;
}
