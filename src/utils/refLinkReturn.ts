// A shared record link (/t/<team>/<type>/<id>) opened while signed out is
// kept for the length of the tab and opened after sign-in (including OAuth,
// whose callback lands on "/"). Only a well-formed record link is kept, so
// this can never send someone to an arbitrary path.
const KEY = 'pendingRefLink';
const CHECKIN_KEY = 'pendingCheckinToken';
export const isRefLinkPath = (path: string) => /^\/t\/\d{1,12}\/[a-z_]{1,20}\/\d{1,12}\/?$/.test(path);

export function rememberRefLink(path: string) {
  if (!isRefLinkPath(path)) return;
  // Only the latest link opened before sign-in is followed: a newer record
  // link replaces an older check-in link (and forgetRefLink does the reverse).
  try { sessionStorage.setItem(KEY, path); sessionStorage.removeItem(CHECKIN_KEY); } catch { /* storage optional */ }
}

export function forgetRefLink() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage optional */ }
}

/** The link to open after sign-in, once. */
export function takeRefLink(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return path && isRefLinkPath(path) ? path : null;
  } catch { return null; }
}
