// Keeps this device's offline FTC data current (Settings → Offline data):
// checks when the app opens, when the connection comes back, and every couple
// of hours while it's open. Does nothing without a downloaded pack, or when
// the member turned automatic updates off.
import { useEffect } from 'react';
import { AUTO_CHECK_EVERY_MS, updateOfflinePackIfBehind } from '../services/offlinePack';

export function useOfflinePackAutoUpdate(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    // A moment after start, so it doesn't compete with the first page load.
    const first = window.setTimeout(() => { void updateOfflinePackIfBehind(); }, 15_000);
    const every = window.setInterval(() => { void updateOfflinePackIfBehind(); }, AUTO_CHECK_EVERY_MS);
    const back = () => { void updateOfflinePackIfBehind({ force: true }); };
    window.addEventListener('online', back);
    return () => { window.clearTimeout(first); window.clearInterval(every); window.removeEventListener('online', back); };
  }, [signedIn]);
}
