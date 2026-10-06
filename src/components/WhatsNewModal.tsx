// WhatsNewModal — changelog viewer + new-version popup.
// Shows when the app version changes (once per version), or on demand
// from Settings.

import { useEffect, useState } from 'react';
import { X, Sparkles, Wrench, Bug } from 'lucide-react';
import { CHANGELOG, CURRENT_VERSION, type ChangelogEntry } from '../utils/changelog';

const SEEN_KEY = 'controlpoint-seen-version';

export function hasUnseenUpdate(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== CURRENT_VERSION;
  } catch {
    return false;
  }
}

export function markVersionSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
  } catch {}
}

function EntrySection({ icon: Icon, title, items, color }: {
  icon: any; title: string; items: string[]; color: string;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${color}`}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-text-base/90 flex gap-2">
            <span className="text-text-muted mt-0.5">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangelogCard({ entry, latest }: { entry: ChangelogEntry; latest?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${latest ? 'border-accent/40 bg-accent/[0.04]' : 'border-text-base/10 bg-text-base/[0.02]'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-base">v{entry.version}</span>
          {latest && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-accent text-accent-ink px-2 py-0.5 rounded-full">
              Latest
            </span>
          )}
        </div>
        <span className="text-xs text-text-muted">{entry.date}</span>
      </div>
      <p className="text-sm font-semibold text-text-base mt-1">{entry.title}</p>
      <EntrySection icon={Sparkles} title="New" items={entry.added} color="text-accent" />
      <EntrySection icon={Wrench} title="Improved" items={entry.improved} color="text-sky-400" />
      <EntrySection icon={Bug} title="Fixed" items={entry.fixed} color="text-emerald-400" />
    </div>
  );
}

export function WhatsNewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (open) markVersionSeen();
  }, [open ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="What's new">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-elevated border border-text-base/10 rounded-3xl shadow-2xl max-h-[92vh] sm:max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 pt-5 pb-4 border-b border-text-base/10">
          <div>
            <h2 className="text-lg font-bold text-text-base">What's New</h2>
            <p className="text-xs text-text-muted mt-0.5">Control Point v{CURRENT_VERSION}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 custom-scrollbar">
          {CHANGELOG.map((entry, i) => (
            <ChangelogCard key={entry.version} entry={entry} latest={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Opens once per new version (shared by the Classic and Modern dialogs). */
export function useWhatsNewAutoOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Small delay so it doesn't fight the onboarding/login flow
    const t = setTimeout(() => {
      if (hasUnseenUpdate()) setOpen(true);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  return [open, setOpen] as const;
}

// Auto-popup on version change
export function WhatsNewAutoPopup() {
  const [open, setOpen] = useWhatsNewAutoOpen();
  return <WhatsNewModal open={open} onClose={() => setOpen(false)} />;
}

export default WhatsNewModal;
