// Settings → Appearance: interface (Modern/Legacy), theme, language, and the
// Legacy background effects (grid, pulse, cursor glow) for people who use the
// Legacy experience.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Moon, RotateCcw, Sun } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Slider, Switch, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useTheme, type Theme } from '../../../hooks/useTheme';
import { SUPPORTED_LANGUAGES, setLanguage } from '../../../i18n';
import { notify } from '../../../components/dialog';
import { InterfaceModePicker } from '../../InterfaceModePicker';
import { useGridSettings } from '../../../components/settings/useGridSettings';
import { PULSE_ORIGIN_OPTIONS } from '../../../utils/gridPulse';
import { SettingsGroup, SettingsRow } from './SettingsPage';

export function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const g = useGridSettings();
  const [effectsOpen, setEffectsOpen] = useState(false);

  const slider = (label: string, value: number, min: number, max: number, step: number, unit: string, on: (v: number) => void, disabled?: boolean) => (
    <div className={cn('grid gap-1.5 px-4 py-3', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{step >= 1 ? Math.round(value) : Math.round(value * 100) / 100}{unit}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={([v]) => on(v)} aria-label={label} />
    </div>
  );

  return (
    <div>
      <SettingsGroup title="Interface">
        <div className="p-4"><InterfaceModePicker /></div>
      </SettingsGroup>

      <SettingsGroup title="Display">
        <SettingsRow label="Theme" description="Follows you on this device.">
          <ToggleGroup type="single" value={theme} onValueChange={(v) => { if (v) setTheme(v as Theme); }} aria-label="Theme">
            <ToggleGroupItem value="light" className="px-3 max-sm:h-10"><Sun /> {t('settings.lightMode')}</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="px-3 max-sm:h-10"><Moon /> {t('settings.darkMode')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label="Language" description="Menus and labels. Your content isn’t translated.">
          <Select
            value={SUPPORTED_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'en'}
            onValueChange={(code) => { setLanguage(code); notify(t('settings.languageChanged'), 'success'); }}
          >
            <SelectTrigger className="w-44 max-sm:h-11" aria-label="Language"><SelectValue /></SelectTrigger>
            <SelectContent>{SUPPORTED_LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>

      <Collapsible open={effectsOpen} onOpenChange={setEffectsOpen}>
        <section className="mb-8 rounded-xl border border-border bg-card">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left">
              <span>
                <span className="block text-sm font-semibold">Legacy background effects</span>
                <span className="block text-sm text-muted-foreground">Grid, pulse and cursor glow behind the Legacy experience.</span>
              </span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', effectsOpen && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border">
              <SettingsRow label="Background grid"><Switch checked={g.gridEnabled} onCheckedChange={(v) => g.updateGrid({ enabled: v })} aria-label="Background grid" /></SettingsRow>
              {slider('Grid size', g.gridSize, 16, 64, 2, 'px', (v) => g.updateGrid({ size: v }), !g.gridEnabled)}
              {slider('Grid brightness', g.gridOpacity, 0.02, 0.4, 0.01, '', (v) => g.updateGrid({ opacity: v }), !g.gridEnabled)}
              <SettingsRow label="Pulsing volt wave"><Switch checked={g.gridPulseEnabled} onCheckedChange={(v) => g.updateGrid({ pulse: v })} aria-label="Pulsing volt wave" /></SettingsRow>
              {slider('Pulse speed', g.gridPulseSpeed, 2, 15, 0.5, 's', (v) => g.updateGrid({ pulseSpeed: v }), !g.gridPulseEnabled)}
              {slider('Pulse intensity', g.gridPulseOpacity, 0.02, 0.4, 0.01, '', (v) => g.updateGrid({ pulseOpacity: v }), !g.gridPulseEnabled)}
              <SettingsRow label="Pulse from" description="At least one stays on.">
                <ToggleGroup
                  type="multiple"
                  value={PULSE_ORIGIN_OPTIONS.filter((o) => g.gridPulseOrigins[o.key]).map((o) => o.key)}
                  onValueChange={(keys) => {
                    if (!keys.length) return; // the last active origin can't be turned off
                    g.updateGrid({ pulseOrigins: { center: keys.includes('center'), edges: keys.includes('edges'), corners: keys.includes('corners') } });
                  }}
                  disabled={!g.gridPulseEnabled}
                  aria-label="Pulse from"
                >
                  {PULSE_ORIGIN_OPTIONS.map((o) => <ToggleGroupItem key={o.key} value={o.key} className="px-3 max-sm:h-10">{o.label}</ToggleGroupItem>)}
                </ToggleGroup>
              </SettingsRow>
              <SettingsRow label="Cursor glow"><Switch checked={g.gridGlowEnabled} onCheckedChange={(v) => g.updateGrid({ glow: v })} aria-label="Cursor glow" /></SettingsRow>
              {slider('Glow size', g.gridGlowSize, 120, 500, 10, 'px', (v) => g.updateGrid({ glowSize: v }), !g.gridGlowEnabled)}
              {slider('Glow intensity', g.gridGlowOpacity, 0.05, 0.6, 0.01, '', (v) => g.updateGrid({ glowOpacity: v }), !g.gridGlowEnabled)}
              <div className="flex justify-end border-t border-border px-4 py-3">
                <Button variant="ghost" size="sm" onClick={g.resetGrid}><RotateCcw /> Reset to defaults</Button>
              </div>
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>
    </div>
  );
}
