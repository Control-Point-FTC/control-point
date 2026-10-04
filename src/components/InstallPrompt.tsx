// InstallPrompt — "Add to Home Screen" banner.
// Shows on mobile when the app isn't installed yet. Handles:
// - Android/Chrome: uses beforeinstallprompt for one-tap install
// - iOS Safari: shows Share → Add to Home Screen instructions
// Dismissable, remembers dismissal for 30 days.

import { useEffect, useState } from 'react';
import { X, Share, PlusSquare, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'controlpoint-install-dismissed';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

function wasDismissedRecently(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isStandalone() || wasDismissedRecently()) return;
    // Only on mobile
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS has no beforeinstallprompt — show after a delay if not installed
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      timer = setTimeout(() => setVisible(true), 10000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
    setShowIOSHelp(false);
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS()) {
      setShowIOSHelp(true);
    }
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:max-w-sm z-[60]">
      <div className="bg-elevated border border-text-base/10 rounded-2xl shadow-2xl p-4">
        {!showIOSHelp ? (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-base">Get the app</p>
              <p className="text-xs text-text-muted mt-0.5">
                Add Control Point to your home screen for quick access.
              </p>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={handleInstall}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 transition-all"
                >
                  {isIOS() ? 'How to install' : 'Install'}
                </button>
                <button
                  onClick={dismiss}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text-base transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="p-1 text-text-muted hover:text-text-base transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-bold text-text-base">Add to Home Screen</p>
              <button onClick={dismiss} aria-label="Dismiss" className="p-1 text-text-muted hover:text-text-base">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs text-text-muted space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                Tap the <Share className="w-3.5 h-3.5 inline" /> Share button in Safari
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                Scroll down and tap <PlusSquare className="w-3.5 h-3.5 inline" /> Add to Home Screen
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                Tap Add — Control Point opens like a native app
              </li>
            </ol>
            <button
              onClick={dismiss}
              className="mt-3 w-full px-3.5 py-2 rounded-xl text-xs font-bold bg-text-base/[0.06] text-text-base hover:bg-text-base/[0.1] transition-all"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default InstallPrompt;
