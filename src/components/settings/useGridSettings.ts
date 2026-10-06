// Legacy background effects (grid, pulse, cursor glow): localStorage-backed
// and applied as CSS vars/classes on <html>. Shared by the Legacy Settings
// modal and the Modern Settings page — same keys, defaults and behaviour.
import { useState } from 'react';
import { DEFAULT_PULSE_ORIGINS, applyPulseOrigins, readPulseOrigins, writePulseOrigins, type PulseOrigins } from '../../utils/gridPulse';

export interface GridSettings {
  enabled: boolean; size: number; opacity: number;
  pulse: boolean; pulseSpeed: number; pulseOpacity: number; pulseOrigins: PulseOrigins;
  glow: boolean; glowSize: number; glowOpacity: number;
}

export const GRID_DEFAULTS: GridSettings = {
  enabled: true, size: 32, opacity: 0.12,
  pulse: true, pulseSpeed: 6, pulseOpacity: 0.22, pulseOrigins: { ...DEFAULT_PULSE_ORIGINS },
  glow: true, glowSize: 280, glowOpacity: 0.25,
};

const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export function applyGridSettings(s: GridSettings) {
  const root = document.documentElement;
  root.classList.toggle('grid-off', !s.enabled);
  root.classList.toggle('grid-pulse-off', !s.pulse);
  root.classList.toggle('grid-glow-off', !s.glow);
  root.style.setProperty('--grid-size', `${s.size}px`);
  root.style.setProperty('--grid-opacity', String(s.opacity));
  root.style.setProperty('--grid-pulse-speed', `${s.pulseSpeed}s`);
  root.style.setProperty('--grid-pulse-opacity', String(s.pulseOpacity));
  applyPulseOrigins(root, s.pulseOrigins);
  root.style.setProperty('--grid-glow-size', `${s.glowSize}px`);
  root.style.setProperty('--grid-glow-opacity', String(s.glowOpacity));
}

export function useGridSettings() {
  const [gridEnabled, setGridEnabled] = useState(() => ls('controlpoint-grid-enabled') !== '0');
  const [gridSize, setGridSize] = useState(() => Number(ls('controlpoint-grid-size')) || 32);
  const [gridOpacity, setGridOpacity] = useState(() => Number(ls('controlpoint-grid-opacity')) || 0.12);
  const [gridPulseEnabled, setGridPulseEnabled] = useState(() => ls('controlpoint-grid-pulse') !== '0');
  const [gridPulseSpeed, setGridPulseSpeed] = useState(() => Number(ls('controlpoint-grid-pulse-speed')) || 6);
  const [gridPulseOpacity, setGridPulseOpacity] = useState(() => Number(ls('controlpoint-grid-pulse-opacity')) || 0.22);
  // Where the pulse glows from: any non-empty mix of centre, edges, corners.
  const [gridPulseOrigins, setGridPulseOrigins] = useState<PulseOrigins>(() => readPulseOrigins(ls('controlpoint-grid-pulse-origins')));
  const [gridGlowEnabled, setGridGlowEnabled] = useState(() => ls('controlpoint-grid-glow') !== '0');
  const [gridGlowSize, setGridGlowSize] = useState(() => Number(ls('controlpoint-grid-glow-size')) || 280);
  const [gridGlowOpacity, setGridGlowOpacity] = useState(() => Number(ls('controlpoint-grid-glow-opacity')) || 0.25);

  const updateGrid = (partial: Partial<GridSettings>) => {
    const s: GridSettings = {
      enabled: partial.enabled ?? gridEnabled,
      size: partial.size ?? gridSize,
      opacity: partial.opacity ?? gridOpacity,
      pulse: partial.pulse ?? gridPulseEnabled,
      pulseSpeed: partial.pulseSpeed ?? gridPulseSpeed,
      pulseOpacity: partial.pulseOpacity ?? gridPulseOpacity,
      pulseOrigins: partial.pulseOrigins ?? gridPulseOrigins,
      glow: partial.glow ?? gridGlowEnabled,
      glowSize: partial.glowSize ?? gridGlowSize,
      glowOpacity: partial.glowOpacity ?? gridGlowOpacity,
    };
    if (partial.enabled !== undefined) { setGridEnabled(s.enabled); save('controlpoint-grid-enabled', s.enabled ? '1' : '0'); }
    if (partial.size !== undefined) { setGridSize(s.size); save('controlpoint-grid-size', String(s.size)); }
    if (partial.opacity !== undefined) { setGridOpacity(s.opacity); save('controlpoint-grid-opacity', String(s.opacity)); }
    if (partial.pulse !== undefined) { setGridPulseEnabled(s.pulse); save('controlpoint-grid-pulse', s.pulse ? '1' : '0'); }
    if (partial.pulseSpeed !== undefined) { setGridPulseSpeed(s.pulseSpeed); save('controlpoint-grid-pulse-speed', String(s.pulseSpeed)); }
    if (partial.pulseOpacity !== undefined) { setGridPulseOpacity(s.pulseOpacity); save('controlpoint-grid-pulse-opacity', String(s.pulseOpacity)); }
    if (partial.pulseOrigins !== undefined) { setGridPulseOrigins(s.pulseOrigins); save('controlpoint-grid-pulse-origins', writePulseOrigins(s.pulseOrigins)); }
    if (partial.glow !== undefined) { setGridGlowEnabled(s.glow); save('controlpoint-grid-glow', s.glow ? '1' : '0'); }
    if (partial.glowSize !== undefined) { setGridGlowSize(s.glowSize); save('controlpoint-grid-glow-size', String(s.glowSize)); }
    if (partial.glowOpacity !== undefined) { setGridGlowOpacity(s.glowOpacity); save('controlpoint-grid-glow-opacity', String(s.glowOpacity)); }
    applyGridSettings(s);
  };

  const resetGrid = () => updateGrid({ ...GRID_DEFAULTS, pulseOrigins: { ...DEFAULT_PULSE_ORIGINS } });

  return {
    gridEnabled, gridSize, gridOpacity, gridPulseEnabled, gridPulseSpeed, gridPulseOpacity, gridPulseOrigins,
    gridGlowEnabled, gridGlowSize, gridGlowOpacity, updateGrid, resetGrid,
  };
}
