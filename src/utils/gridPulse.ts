// Where the background grid pulse glows from (Settings → Appearance).
// Persisted as a comma list in localStorage ('controlpoint-grid-pulse-origins')
// and applied as 0/1 multipliers that index.css folds into each glow layer.

export type PulseOrigin = 'center' | 'edges' | 'corners';
export type PulseOrigins = Record<PulseOrigin, boolean>;

export const DEFAULT_PULSE_ORIGINS: PulseOrigins = { center: true, edges: true, corners: true };

export const PULSE_ORIGIN_OPTIONS: { key: PulseOrigin; label: string }[] = [
  { key: 'center', label: 'Center' },
  { key: 'edges', label: 'Edges' },
  { key: 'corners', label: 'Corners' },
];

/** Parse the stored list; missing, junk, or empty falls back to all origins. */
export function readPulseOrigins(raw: string | null): PulseOrigins {
  if (raw == null) return { ...DEFAULT_PULSE_ORIGINS };
  const set = new Set(raw.split(',').map((s) => s.trim()));
  const o: PulseOrigins = { center: set.has('center'), edges: set.has('edges'), corners: set.has('corners') };
  return o.center || o.edges || o.corners ? o : { ...DEFAULT_PULSE_ORIGINS };
}

export function writePulseOrigins(o: PulseOrigins): string {
  return PULSE_ORIGIN_OPTIONS.filter(({ key }) => o[key]).map(({ key }) => key).join(',');
}

export function applyPulseOrigins(root: HTMLElement, o: PulseOrigins): void {
  root.style.setProperty('--pulse-on-center', o.center ? '1' : '0');
  root.style.setProperty('--pulse-on-edge', o.edges ? '1' : '0');
  root.style.setProperty('--pulse-on-corner', o.corners ? '1' : '0');
}
