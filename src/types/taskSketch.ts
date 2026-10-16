// A sketch on a task: ink strokes in the notebook's own format (points of
// [x, y, pressure], pen or highlighter), on a fixed 800 × 500 board. Shared by
// the server (which stores only what passes this check) and the sketchpad.

export const SKETCH_W = 800;
export const SKETCH_H = 500;
export const MAX_SKETCH_STROKES = 600;
export const MAX_SKETCH_POINTS = 30000;
export const MAX_SKETCHES_PER_TASK = 12;
export const MAX_SKETCH_TITLE = 80;

/** The notebook's pen colours (black, white, red, orange, yellow, green, blue, purple). */
export const SKETCH_COLORS = ['#111111', '#ffffff', '#e63946', '#f28c28', '#f5ce36', '#2caa65', '#2587db', '#9457c7'] as const;
export const SKETCH_WIDTHS = [2, 4, 8] as const;

export type SketchStroke = { tool: 'pen' | 'highlighter'; color: string; width: number; points: [number, number, number][] };
export type Sketch = { strokes: SketchStroke[] };

const round = (n: number) => Math.round(n * 10) / 10;

/** A sketch fit to store, or null when it isn't one (or is too big). Empty sketches are refused. */
export function cleanSketch(v: unknown): Sketch | null {
  const raw = (v as any)?.strokes;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SKETCH_STROKES) return null;
  const strokes: SketchStroke[] = [];
  let total = 0;
  for (const s of raw) {
    if (!s || typeof s !== 'object') return null;
    const tool = s.tool === 'highlighter' ? 'highlighter' : s.tool === 'pen' ? 'pen' : null;
    const color = typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color.toLowerCase() : null;
    const width = Number(s.width);
    if (!tool || !color || !Number.isFinite(width) || width < 1 || width > 40 || !Array.isArray(s.points) || s.points.length === 0) return null;
    total += s.points.length;
    if (total > MAX_SKETCH_POINTS) return null;
    const points: [number, number, number][] = [];
    for (const p of s.points) {
      if (!Array.isArray(p) || p.length < 2) return null;
      const [x, y] = [Number(p[0]), Number(p[1])];
      const pressure = p.length > 2 ? Number(p[2]) : 0.5;
      if (![x, y, pressure].every(Number.isFinite)) return null;
      points.push([round(Math.min(SKETCH_W, Math.max(0, x))), round(Math.min(SKETCH_H, Math.max(0, y))), Math.round(Math.min(1, Math.max(0, pressure)) * 100) / 100]);
    }
    strokes.push({ tool, color, width: round(width), points });
  }
  return { strokes };
}

/** A stored sketch (JSON text) read back; bad data → no strokes. */
export function parseSketch(raw: unknown): Sketch {
  try { return cleanSketch(typeof raw === 'string' ? JSON.parse(raw) : raw) ?? { strokes: [] }; } catch { return { strokes: [] }; }
}

export function cleanSketchTitle(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_SKETCH_TITLE) : '';
}
