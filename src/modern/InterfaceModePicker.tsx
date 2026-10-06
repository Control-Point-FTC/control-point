// Settings → Appearance: choose the Legacy or Modern experience (per user), and
// (admins) the workspace default. Switching applies instantly.
import { useState } from 'react';
import { Check, LayoutPanelLeft, Sparkles } from 'lucide-react';
import { cn } from '../components/cn';
import { apiFetch } from '../services/api';
import { useInterfaceMode, type InterfaceMode } from './interfaceMode';

const OPTIONS: { id: InterfaceMode; title: string; desc: string; icon: typeof Sparkles; recommended?: boolean }[] = [
  {
    id: 'modern',
    title: 'Modern Experience',
    desc: 'The redesigned Control Point: a calmer workspace with a new sidebar, ⌘K search, an Inbox and redesigned pages as they roll out.',
    icon: Sparkles,
    recommended: true,
  },
  {
    id: 'legacy',
    title: 'Legacy Experience',
    desc: 'The classic layout, navigation and dashboard you already know. Nothing about your data changes.',
    icon: LayoutPanelLeft,
  },
];

export function InterfaceModePicker() {
  const { mode, setMode } = useInterfaceMode();
  const [saving, setSaving] = useState<InterfaceMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = async (m: InterfaceMode) => {
    if (m === mode) return;
    setSaving(m); setError(null);
    const ok = await setMode(m);
    setSaving(null);
    if (!ok) setError('Could not save your choice. Try again.');
  };
  return (
    <section aria-labelledby="interface-mode-heading">
      <h3 id="interface-mode-heading" className="text-sm font-bold text-text-base">Interface</h3>
      <p className="mt-1 text-xs text-text-muted">Switch any time. It follows you to every device and workspace.</p>
      <div role="radiogroup" aria-labelledby="interface-mode-heading" className="mt-3 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const on = mode === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={saving != null}
              onClick={() => void pick(o.id)}
              className={cn(
                'relative flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors disabled:opacity-70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                on ? 'border-accent bg-accent/[0.06]' : 'border-line bg-text-base/[0.02] hover:border-text-base/20',
              )}
            >
              <span className="flex items-center gap-2">
                <o.icon className={cn('size-4', on ? 'text-accent' : 'text-text-muted')} />
                <span className="text-sm font-semibold text-text-base">{o.title}</span>
                {o.recommended && <span className="rounded-full border border-sky-400/50 bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-500">Recommended</span>}
                <span className={cn('ml-auto flex size-5 items-center justify-center rounded-full border', on ? 'border-accent bg-accent text-accent-ink' : 'border-text-base/25')}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </span>
              <span className="text-xs leading-relaxed text-text-muted">{o.desc}</span>
              {saving === o.id && <span className="text-xs text-text-muted">Switching…</span>}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-500">{error}</p>}
    </section>
  );
}

/** Admins: the workspace default for members who haven't picked a mode. */
export function WorkspaceInterfaceDefault({ team, onTeamSaved }: { team: any; onTeamSaved: (t: any) => void }) {
  const current: InterfaceMode | 'none' = team?.default_interface_mode === 'modern' || team?.default_interface_mode === 'legacy' ? team.default_interface_mode : 'none';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (v: string) => {
    if (!team?.id) return;
    setSaving(true); setError(null);
    const value = v === 'none' ? null : v;
    try {
      const res = await apiFetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_interface_mode: value }),
      });
      if (!res.ok) throw new Error();
      onTeamSaved({ id: team.id, default_interface_mode: value });
    } catch {
      setError('Could not save the workspace default.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section>
      <h3 className="text-sm font-bold text-text-base">Default interface</h3>
      <p className="mt-1 mb-3 text-xs text-text-muted">Used by members who haven't chosen one themselves. Members can always override it.</p>
      <div role="radiogroup" aria-label="Default interface" className="inline-flex rounded-xl border border-line bg-secondary p-1">
        {([['none', 'Not set (Legacy)'], ['legacy', 'Legacy'], ['modern', 'Modern']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={current === v}
            disabled={saving}
            onClick={() => void save(v)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60',
              current === v ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-text-base',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-500">{error}</p>}
    </section>
  );
}
