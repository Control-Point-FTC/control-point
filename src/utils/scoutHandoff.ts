// "Continue with Control Point" from Control Scout, opened while signed out.
// The server sends the visitor to /?scout_state=<state>; the state is kept
// for the length of the tab (it survives an OAuth round trip, whose callback
// lands on "/") and, once signed in, the browser goes back to
// /api/auth/scout/start, which hands off to Scout. The return path is built
// here from a validated state, so this can never send anyone elsewhere.
const KEY = 'pendingScoutHandoff';
export const isScoutState = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(s);

/** Keep ?scout_state from the current URL (if valid); true when one was kept. */
export function rememberScoutHandoff(search: string): boolean {
  const state = new URLSearchParams(search).get('scout_state');
  if (!isScoutState(state)) return false;
  try { sessionStorage.setItem(KEY, state); } catch { /* storage optional */ }
  return true;
}

/** Is a hand-off to Control Scout waiting for sign-in? (Read only: doesn't consume it.) */
export function scoutHandoffPending(): boolean {
  try { return isScoutState(sessionStorage.getItem(KEY)); } catch { return false; }
}

/** Where to go after sign-in to finish the hand-off, once. */
export function takeScoutHandoff(): string | null {
  try {
    const state = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isScoutState(state) ? `/api/auth/scout/start?state=${encodeURIComponent(state)}` : null;
  } catch { return null; }
}
