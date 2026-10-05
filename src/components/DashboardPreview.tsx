import { useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2, Zap, CheckSquare, MessageSquare, Calendar } from 'lucide-react';
import { cn } from './onboarding/onboardingState';

/** Cursor glow: track the pointer like the real dashboard (see App.tsx). */
function trackGlow(e: PointerEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
  el.classList.add('grid-hot');
}

/**
 * Mini dashboard mockup for the Appearance settings preview.
 * Uses the app's real theme tokens and the same grid layers as the app
 * (grid, pulse from centre/edges/corners, cursor glow), so every Appearance
 * control shows up here live.
 */
export function DashboardPreview({ onClose }: { onClose?: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const preview = (big: boolean) => (
    <div
      className={cn(
        'relative rounded-2xl border border-text-base/10 bg-primary overflow-hidden app-volt-grid grid-pulse',
        'w-full',
        big && 'h-full'
      )}
      onPointerMove={trackGlow}
      onPointerLeave={(e) => e.currentTarget.classList.remove('grid-hot')}
    >
      <div className="grid-pulse-layer grid-pulse-center" aria-hidden="true" />
      <div className="grid-pulse-layer grid-pulse-edges" aria-hidden="true" />
      <div className="grid-pulse-layer grid-pulse-corners" aria-hidden="true" />
      <div className="grid-reactive-spot" aria-hidden="true" />
      {/* Mini sidebar */}
      <div className={cn('relative flex', big ? 'h-full' : 'h-64')}>
        <div className="w-14 flex-shrink-0 bg-secondary border-r border-text-base/10 flex flex-col items-center py-3 gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center">
            <Zap className="w-4 h-4 text-accent-ink" />
          </div>
          {[CheckSquare, MessageSquare, Calendar].map((Icon, i) => (
            <div key={i} className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center',
              i === 0 ? 'bg-accent/15 text-accent' : 'text-text-muted'
            )}>
              <Icon className="w-4 h-4" />
            </div>
          ))}
        </div>
        {/* Mini content */}
        <div className="flex-1 p-4 space-y-3 overflow-hidden">
          <div>
            <p className="text-sm font-display font-bold text-text-base">Good evening</p>
            <p className="text-[11px] text-text-muted">Here's what's happening today</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Tasks done', value: '12' },
              { label: 'Events', value: '3' },
              { label: 'Messages', value: '48' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-secondary border border-text-base/10 p-2.5">
                <p className="text-lg font-bold text-text-base">{s.value}</p>
                <p className="text-[10px] text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-secondary border border-text-base/10 p-3">
            <p className="text-xs font-bold text-text-base mb-2">Upcoming</p>
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                <div className="h-2 rounded bg-text-base/10 flex-1" style={{ width: `${70 - i * 15}%` }} />
              </div>
            ))}
          </div>
          <button className="px-4 py-2 rounded-xl text-xs font-bold bg-accent text-accent-ink">
            Primary button
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-text-base/10 bg-secondary/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-text-base uppercase tracking-widest">Preview</p>
        <div className="flex gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors"
            title={expanded ? "Shrink preview" : "Expand preview"}
            aria-label={expanded ? "Shrink preview" : "Expand preview"}
            aria-expanded={expanded}
          >
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors"
              title="Hide preview"
              aria-label="Hide preview"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {preview(false)}
      {expanded && createPortal(
        // data-esc-owner: Escape inside this overlay closes only the overlay
        // (SettingsModal's window listener skips events from such elements).
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard preview"
          data-esc-owner
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); setExpanded(false); return; }
            // Focus trap: Tab / Shift+Tab stay inside the overlay.
            if (e.key !== 'Tab') return;
            const f = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')];
            if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }}
        >
          <button className="absolute inset-0 bg-black/60 cursor-default" aria-label="Close preview" onClick={() => setExpanded(false)} />
          <div className="relative w-[min(1100px,94vw)] h-[min(680px,82vh)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Preview</p>
              <button
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                aria-label="Shrink preview"
                autoFocus
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">{preview(true)}</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
