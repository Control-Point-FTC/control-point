// The service worker keeps the last answer of a few read-only API calls so
// Compete, Tasks and Calendar work offline (see public/sw.js). That copy
// belongs to one account in one workspace: drop it whenever either changes,
// and re-save who is signed in once a new session is set up.
import { apiFetch } from './api';

export const OFFLINE_API_CACHE = 'control-point-api-v1';

export function clearOfflineData(): void {
  const worker = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  // The worker clears it in order with its own pending saves; without a
  // worker, drop it from here.
  if (worker) {
    try { worker.postMessage({ type: 'clear-api-cache' }); } catch { /* worker gone */ }
  } else {
    try { void caches?.delete(OFFLINE_API_CACHE); } catch { /* CacheStorage unavailable */ }
  }
}

/** After sign-in or a workspace switch: fetch /me so an offline reload stays signed in. */
export function warmOfflineSession(): void {
  apiFetch('/api/auth/me').catch(() => { /* offline or signed out: nothing to save */ });
}
