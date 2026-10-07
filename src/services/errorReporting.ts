// Client error reporting: unexpected render errors and unhandled exceptions
// are sent to the server (/api/client-errors) so the owner can see what broke
// in real users' browsers. Deduplicated and capped per page load; never
// throws; never sends form contents or tokens (only message, stack, route).
import { apiFetch } from './api';

const MAX_PER_PAGE = 10;
const sent = new Set<string>();
let count = 0;

export interface ClientErrorReport {
  kind: 'render' | 'uncaught' | 'unhandledrejection' | 'chunk';
  message: string;
  stack?: string;
  componentStack?: string;
}

/** Chunks of a previous deploy are gone after a new one: reload once to get the new build. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError|Unable to preload CSS/i.test(msg);
}

const RELOAD_KEY = 'cp-chunk-reload-at';
/** Reload the page to pick up a new deploy, at most once a minute (no loops). Returns true if reloading. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage the once-a-minute limit can't hold — a chunk that keeps
    // failing (offline, say) would reload forever. Show the fallback instead.
    return false;
  }
  window.location.reload();
  return true;
}

export function reportClientError(r: ClientErrorReport): void {
  try {
    const key = `${r.kind}|${r.message}`.slice(0, 300);
    if (sent.has(key) || count >= MAX_PER_PAGE) return;
    sent.add(key);
    count++;
    void apiFetch('/api/client-errors', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        kind: r.kind,
        message: String(r.message || '').slice(0, 500),
        stack: String(r.stack || '').slice(0, 4000),
        componentStack: String(r.componentStack || '').slice(0, 4000),
        // Path only — no query string (it can carry codes or search text).
        route: window.location.pathname.slice(0, 200),
        release: (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)?.src.split('/').pop()?.slice(0, 80) || '',
      }),
    }).catch(() => {});
  } catch { /* reporting must never throw */ }
}

let installed = false;
/** Report uncaught errors and unhandled rejections (once per page). */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    // Resource load errors (img/script tags) have no `error`; skip those.
    if (!e.error && !e.message) return;
    if (isChunkLoadError(e.error || e.message) && reloadForNewBuild()) return;
    reportClientError({ kind: 'uncaught', message: String(e.message || e.error?.message || 'Error'), stack: e.error?.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    if (isChunkLoadError(reason) && reloadForNewBuild()) return;
    reportClientError({ kind: 'unhandledrejection', message: String(reason?.message || reason || 'Unhandled rejection'), stack: reason?.stack });
  });
}
