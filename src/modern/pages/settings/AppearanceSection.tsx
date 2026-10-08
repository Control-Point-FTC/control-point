// Settings → Appearance: theme, and the background grid (owner request: let
// everyone customise it). The grid's colour isn't a personal choice: it
// follows the workspace's team colour, which admins set.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Moon, Palette, RotateCcw, Smartphone, Sun } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button, Slider, Switch, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { useTheme, type Theme } from '../../../hooks/useTheme';
import { GRID_DEFAULTS, GRID_LIMITS, PULSE_ORIGINS, readGridPrefs, saveGridPrefs, type GridFade, type GridPrefs, type GridStyle, type PulseOrigin } from '../../gridPrefs';
import { SettingsGroup, SettingsRow } from './SettingsPage';
import { CUSTOMIZE_TABS_EVENT } from '../../chrome/CustomizeTabsDialog';

function useMediaQuery(q: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, [q]);
  return on;
}

export function AppearanceSection({ isAdmin }: { isAdmin?: boolean }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [g, setG] = useState<GridPrefs>(() => readGridPrefs());
  const update = (patch: Partial<GridPrefs>) => {
    const next = { ...g, ...patch };
    setG(next);
    saveGridPrefs(next); // applies live: this page's own background is the preview
  };
  const off = !g.enabled;
  // The tab bar only exists on phone-width screens (same breakpoint as the shell).
  const phone = useMediaQuery('(max-width: 767px)');

  const slider = (label: string, value: number, [min, max]: readonly [number, number], step: number, shown: string, on: (v: number) => void, disabled: boolean) => (
    <div className={cn('grid gap-1.5 border-b border-border px-4 py-3 last:border-b-0', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{shown}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={([v]) => on(v)} aria-label={label} />
    </div>
  );

  return (
    <div>
      <SettingsGroup title="Display">
        <SettingsRow label="Theme" description="Follows you on this device.">
          <ToggleGroup type="single" value={theme} onValueChange={(v) => { if (v) setTheme(v as Theme); }} aria-label="Theme">
            <ToggleGroupItem value="light"><Sun /> {t('settings.lightMode')}</ToggleGroupItem>
            <ToggleGroupItem value="dark"><Moon /> {t('settings.darkMode')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
      </SettingsGroup>

      {phone && (
        <SettingsGroup title="Phone tab bar">
          <SettingsRow label="Tabs at the bottom" description="Choose the three pages next to Bruno and More. Saved on this device.">
            <Button variant="outline" className="max-sm:h-11" onClick={() => window.dispatchEvent(new Event(CUSTOMIZE_TABS_EVENT))}><Smartphone /> Customize tab bar</Button>
          </SettingsRow>
        </SettingsGroup>
      )}

      <SettingsGroup title="Background grid" description="Shape the grid behind your pages. Saved on this device; changes show right away.">
        <SettingsRow label="Show the grid" htmlFor="grid-on">
          <Switch id="grid-on" checked={g.enabled} onCheckedChange={(v) => update({ enabled: v })} />
        </SettingsRow>
        <SettingsRow label="Style">
          <ToggleGroup type="single" value={g.style} disabled={off} onValueChange={(v) => { if (v) update({ style: v as GridStyle }); }} aria-label="Grid style">
            <ToggleGroupItem value="lines">Lines</ToggleGroupItem>
            <ToggleGroupItem value="dots">Dots</ToggleGroupItem>
            <ToggleGroupItem value="graph">Graph paper</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
        {slider('Cell size', g.size, GRID_LIMITS.size, 2, `${g.size}px`, (v) => update({ size: v }), off)}
        {slider('Intensity', g.intensity, GRID_LIMITS.intensity, 0.01, `${Math.round(g.intensity * 100)}%`, (v) => update({ intensity: Math.round(v * 100) / 100 }), off)}
        <SettingsRow label="Line weight">
          <ToggleGroup type="single" value={String(g.thickness)} disabled={off} onValueChange={(v) => { if (v) update({ thickness: Number(v) }); }} aria-label="Line weight">
            <ToggleGroupItem value="1">Fine</ToggleGroupItem>
            <ToggleGroupItem value="2">Bold</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label="Fade" description="How far down the page the grid reaches.">
          <ToggleGroup type="single" value={g.fade} disabled={off} onValueChange={(v) => { if (v) update({ fade: v as GridFade }); }} aria-label="Grid fade">
            <ToggleGroupItem value="short">Short</ToggleGroupItem>
            <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
            <ToggleGroupItem value="long">Long</ToggleGroupItem>
            <ToggleGroupItem value="none">Whole page</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label="Pulse" description="The grid slowly brightens and dims. Off when your device asks for reduced motion." htmlFor="grid-pulse">
          <Switch id="grid-pulse" checked={g.pulse} disabled={off} onCheckedChange={(v) => update({ pulse: v })} />
        </SettingsRow>
        {slider('Pulse speed', g.pulseSpeed, GRID_LIMITS.pulseSpeed, 0.5, `${g.pulseSpeed}s`, (v) => update({ pulseSpeed: v }), off || !g.pulse)}
        <SettingsRow label="Pulse from" description="Where the glow starts. Pick any mix.">
          <ToggleGroup
            type="multiple"
            value={g.pulseFrom}
            disabled={off || !g.pulse}
            // At least one: un-picking the last origin is ignored.
            onValueChange={(v: string[]) => { if (v.length) update({ pulseFrom: v as PulseOrigin[] }); }}
            aria-label="Pulse from"
          >
            {PULSE_ORIGINS.map((o) => <ToggleGroupItem key={o.key} value={o.key}>{o.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label="Cursor glow" description="A soft light that follows your pointer." htmlFor="grid-glow">
          <Switch id="grid-glow" checked={g.glow} disabled={off} onCheckedChange={(v) => update({ glow: v })} />
        </SettingsRow>
        {slider('Glow size', g.glowSize, GRID_LIMITS.glowSize, 10, `${g.glowSize}px`, (v) => update({ glowSize: v }), off || !g.glow)}
        {slider('Glow intensity', g.glowIntensity, GRID_LIMITS.glowIntensity, 0.01, `${Math.round(g.glowIntensity * 100)}%`, (v) => update({ glowIntensity: Math.round(v * 100) / 100 }), off || !g.glow)}
        <SettingsRow
          label="Colour"
          description={isAdmin
            ? 'The grid uses your team colour, so every member sees the same team colours. Change it in Workspaces.'
            : 'The grid uses your team colour, set by your workspace admins.'}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-6 rounded-md border border-border" style={{ backgroundColor: 'rgb(var(--grid-rgb, 255 199 0))' }} />
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate('/teams?tab=workspaces')}><Palette /> Team colour</Button>
            )}
          </span>
        </SettingsRow>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => update({ ...GRID_DEFAULTS })}><RotateCcw /> Reset grid</Button>
        </div>
      </SettingsGroup>
    </div>
  );
}
