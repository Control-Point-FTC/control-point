import { Check } from 'lucide-react';
import { cn } from './onboarding/onboardingState';

// --- Presence (Discord-style online / idle / dnd / invisible) ---
// Display values: online | idle | dnd | offline. The *setting* also allows
// 'invisible' (shown as offline). The server computes display presence from
// the setting + session last_activity.
export const PRESENCE_META: Record<string, { dot: string; label: string; desc: string }> = {
  online: { dot: 'bg-emerald-500', label: 'Online', desc: 'Active now' },
  idle: { dot: 'bg-amber-400', label: 'Idle', desc: 'Away from keyboard' },
  dnd: { dot: 'bg-rose-500', label: 'Do Not Disturb', desc: 'Mute all notifications' },
  offline: { dot: 'bg-zinc-500', label: 'Offline', desc: 'Not around right now' },
};
export const PRESENCE_SETTINGS = ['online', 'idle', 'dnd', 'invisible'] as const;
export const PRESENCE_SETTING_META: Record<string, { dot: string; label: string; desc: string }> = {
  ...PRESENCE_META,
  invisible: { dot: 'bg-zinc-600', label: 'Invisible', desc: 'Appear offline' },
};

/**
 * Your own status for your own chip: you're using the app, so it's the status
 * you picked (Invisible shows the offline dot), never a stale "offline" from
 * when the page loaded.
 */
export function ownPresence(setting: string | null | undefined): { dot: string; label: string } {
  const s = setting && PRESENCE_SETTING_META[setting] ? setting : 'online';
  return { dot: s === 'invisible' ? 'offline' : s, label: PRESENCE_SETTING_META[s].label };
}

export const PresenceDot = ({ presence, className }: any) => {
  const meta = PRESENCE_META[presence] || PRESENCE_META.offline;
  return (
    <span
      title={meta.label}
      className={cn('rounded-full border-2 border-secondary flex-shrink-0', meta.dot, className || 'w-3 h-3')}
    />
  );
};

/** Small popover/list to pick your own status. Purely presentational — parent PATCHes /api/profile. */
export const PresencePicker = ({ value, onPick }: { value?: string; onPick: (s: string) => void }) => (
  <div className="py-1.5">
    {PRESENCE_SETTINGS.map((s) => {
      const meta = PRESENCE_SETTING_META[s];
      const active = (value || 'online') === s;
      return (
        <button
          key={s}
          onClick={() => onPick(s)}
          aria-pressed={active}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset',
            active ? 'bg-accent/15' : 'hover:bg-text-base/[0.06]'
          )}
        >
          <span className={cn('w-3.5 h-3.5 rounded-full flex-shrink-0', meta.dot)} />
          <span className="flex-1 min-w-0">
            <span className={cn('block text-sm font-semibold', active ? 'text-accent' : 'text-text-base')}>{meta.label}</span>
            <span className="block text-xs text-text-muted truncate">{meta.desc}</span>
          </span>
          {active && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
        </button>
      );
    })}
  </div>
);
