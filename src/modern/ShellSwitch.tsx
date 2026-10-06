// Picks the Legacy or Modern chrome for the current interface mode. Both are
// built from the same App state and render the same routed content.
import type { ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { useInterfaceMode } from './interfaceMode';

export function ShellSwitch({ legacy, modern }: { legacy: ReactNode; modern: () => ReactNode }) {
  const { mode } = useInterfaceMode();
  // `modern` is a render function so the Modern tree isn't built for Legacy users.
  return <>{mode === 'modern' ? modern() : legacy}</>;
}

const DISMISS_KEY = 'cp-try-modern-dismissed';

/** Legacy-only, dismissible invitation to try the Modern experience. Shown
 *  only to users who haven't picked a mode yet. */
export function TryModernBanner() {
  const { chosen, setMode } = useInterfaceMode();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  if (chosen || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage unavailable */ }
  };
  return (
    <div role="region" aria-label="New experience available" className="mb-4 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3">
      <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Preview</span>
      <p className="min-w-0 flex-1 text-sm text-text-base">
        <span className="font-semibold">Try the new Control Point.</span>{' '}
        <span className="text-text-muted">A redesigned, faster workspace. You can switch back anytime in Settings → Appearance.</span>
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => { setBusy(true); const ok = await setMode('modern'); if (!ok) setBusy(false); }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-accent-ink hover:brightness-105 disabled:opacity-60"
      >
        Try it <ArrowRight className="size-4" />
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-text-base/[0.08] hover:text-text-base">
        <X className="size-4" />
      </button>
    </div>
  );
}
