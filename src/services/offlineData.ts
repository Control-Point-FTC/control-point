// The service worker keeps the last answer of a few read-only API calls so
// Compete, Tasks and Calendar work offline (see public/sw.js). That copy
// belongs to one account in one workspace: drop it whenever either changes.
export const OFFLINE_API_CACHE = 'control-point-api-v1';

export function clearOfflineData(): void {
  try { void caches?.delete(OFFLINE_API_CACHE); } catch { /* CacheStorage unavailable */ }
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'clear-api-cache' }); } catch { /* no worker */ }
}
