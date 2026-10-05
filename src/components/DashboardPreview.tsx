import { useState } from 'react';
import { X, Maximize2, Minimize2, Zap, CheckSquare, MessageSquare, Calendar } from 'lucide-react';
import { cn } from './onboarding/onboardingState';

/**
 * Mini dashboard mockup for the Appearance settings preview.
 * Uses the app's real theme tokens so it reflects theme/grid changes live.
 */
export function DashboardPreview({ onClose }: { onClose?: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const preview = (
    <div className={cn(
      'rounded-2xl border border-text-base/10 bg-primary overflow-hidden app-volt-grid',
      'w-full'
    )}>
      {/* Mini sidebar */}
      <div className="flex h-64">
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
            <p className="text-sm font-display font-bold text-text-base">Good evening, Sushil</p>
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
      <div className={cn(expanded && "scale-[1.02] origin-top")}>
        {preview}
      </div>
      {expanded && (
        <p className="text-[11px] text-text-muted text-center">Expanded — settings stay accessible while you tweak</p>
      )}
    </div>
  );
}
