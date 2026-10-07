// Background grid preferences (Settings → Appearance). Everyone can shape the
// grid behind their pages: style, size, intensity, line weight, fade, a slow
// pulse and a cursor glow. Its colour is not a personal choice: it always
// follows the workspace's team colour, which admins set. Saved per device
// (like the theme) and applied as CSS variables/classes on <html>.

export type GridStyle = 'lines' | 'dots' | 'graph';
export type GridFade = 'short' | 'medium' | 'long' | 'none';

export interface GridPrefs {
  enabled: boolean;
  style: GridStyle;
  /** Cell size in px. */
  size: number;
  /** Line strength, 0.02–0.3. */
  intensity: number;
  /** Line weight in px (1 or 2). */
  thickness: number;
  fade: GridFade;
  pulse: boolean;
  /** Seconds per pulse. */
  pulseSpeed: number;
  glow: boolean;
  /** Glow radius in px. */
  glowSize: number;
  /** Glow strength, 0.05–0.5. */
  glowIntensity: number;
}

export const GRID_DEFAULTS: GridPrefs = {
  enabled: true, style: 'lines', size: 32, intensity: 0.07, thickness: 1, fade: 'medium',
  pulse: false, pulseSpeed: 6, glow: false, glowSize: 260, glowIntensity: 0.18,
};

export const GRID_LIMITS = {
  size: [12, 80], intensity: [0.02, 0.3], thickness: [1, 2], pulseSpeed: [2, 15], glowSize: [120, 520], glowIntensity: [0.05, 0.5],
} as const;

const KEY = 'cp-grid-prefs';
const FADE_PX: Record<Exclude<GridFade, 'none'>, number> = { short: 320, medium: 520, long: 900 };
const clamp = (n: unknown, [lo, hi]: readonly [number, number], d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};

/** Stored prefs, with defaults for anything missing or invalid. */
export function readGridPrefs(raw: string | null = safeGet()): GridPrefs {
  let o: any = {};
  try { o = raw ? JSON.parse(raw) : {}; } catch { o = {}; }
  // Stored JSON that isn't an object (null, a number, a list) means defaults.
  if (o === null || typeof o !== 'object' || Array.isArray(o)) o = {};
  const d = GRID_DEFAULTS;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    style: (['lines', 'dots', 'graph'] as const).includes(o.style) ? o.style : d.style,
    size: Math.round(clamp(o.size, GRID_LIMITS.size, d.size)),
    intensity: clamp(o.intensity, GRID_LIMITS.intensity, d.intensity),
    thickness: Math.round(clamp(o.thickness, GRID_LIMITS.thickness, d.thickness)),
    fade: (['short', 'medium', 'long', 'none'] as const).includes(o.fade) ? o.fade : d.fade,
    pulse: typeof o.pulse === 'boolean' ? o.pulse : d.pulse,
    pulseSpeed: clamp(o.pulseSpeed, GRID_LIMITS.pulseSpeed, d.pulseSpeed),
    glow: typeof o.glow === 'boolean' ? o.glow : d.glow,
    glowSize: Math.round(clamp(o.glowSize, GRID_LIMITS.glowSize, d.glowSize)),
    glowIntensity: clamp(o.glowIntensity, GRID_LIMITS.glowIntensity, d.glowIntensity),
  };
}

function safeGet(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function saveGridPrefs(p: GridPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  applyGridPrefs(p);
  window.dispatchEvent(new CustomEvent(GRID_PREFS_EVENT, { detail: p }));
}

export const GRID_PREFS_EVENT = 'cp-grid-prefs';

/** Put the prefs on <html> as CSS variables and classes (see modern.css). */
export function applyGridPrefs(p: GridPrefs, root: HTMLElement = document.documentElement) {
  root.classList.toggle('cp-grid-off', !p.enabled);
  for (const s of ['lines', 'dots', 'graph'] as const) root.classList.toggle(`cp-grid-${s}`, p.enabled && p.style === s);
  root.classList.toggle('cp-grid-nofade', p.fade === 'none');
  root.classList.toggle('cp-grid-pulse', p.enabled && p.pulse);
  root.classList.toggle('cp-grid-glow', p.enabled && p.glow);
  root.style.setProperty('--cp-grid-size', `${p.size}px`);
  root.style.setProperty('--cp-grid-alpha', String(p.intensity));
  root.style.setProperty('--cp-grid-width', `${p.thickness}px`);
  if (p.fade !== 'none') root.style.setProperty('--cp-grid-fade', `${FADE_PX[p.fade]}px`);
  root.style.setProperty('--cp-grid-pulse-speed', `${p.pulseSpeed}s`);
  root.style.setProperty('--cp-glow-size', `${p.glowSize}px`);
  root.style.setProperty('--cp-glow-alpha', String(p.glowIntensity));
}
