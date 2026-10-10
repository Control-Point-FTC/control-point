// Draw → Favorite pens: one-click pens (tool, color and size), kept on this
// device. A few useful defaults; Save pen adds the current one.
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type PenPreset = { tool: 'pen' | 'highlighter'; color: string; size: number };
export const DEFAULT_PENS: PenPreset[] = [
  { tool: 'pen', color: '#111111', size: 2 }, { tool: 'pen', color: '#2563eb', size: 3 },
  { tool: 'pen', color: '#dc2626', size: 3 }, { tool: 'highlighter', color: '#facc15', size: 12 },
];
export const MAX_PENS = 8;
const valid = (p: unknown): p is PenPreset => !!p && typeof p === 'object'
  && ['pen', 'highlighter'].includes((p as PenPreset).tool) && /^#[0-9a-f]{6}$/i.test((p as PenPreset).color) && [2, 3, 6, 12].includes((p as PenPreset).size);
const same = (a: PenPreset, b: PenPreset) => a.tool === b.tool && a.color.toLowerCase() === b.color.toLowerCase() && a.size === b.size;

// The latest list per key in this window: edits build on it even when
// storage is unavailable (private mode, full quota).
const latest = new Map<string, PenPreset[]>();
export function readPens(key?: string): PenPreset[] {
  if (!key) return DEFAULT_PENS;
  const known = latest.get(key);
  if (known) return known;
  try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return Array.isArray(v) ? v.filter(valid).slice(0, MAX_PENS) : DEFAULT_PENS; } catch { return DEFAULT_PENS; }
}
// Several Draw ribbons can be open at once (split view): every change is
// applied to the latest saved list, then announced so the others update.
const CHANGED = 'cp-notebook-pens-changed';
function changePens(key: string | undefined, change: (pens: PenPreset[]) => PenPreset[]) {
  const next = change(readPens(key)).slice(-MAX_PENS);
  if (key) latest.set(key, next);
  try { if (key) localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage optional */ }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }));
  return next;
}

const SIZE_NAME: Record<number, string> = { 2: 'fine', 3: 'medium', 6: 'thick', 12: 'extra thick' };
const label = (p: PenPreset) => `${p.tool === 'highlighter' ? 'Highlighter' : 'Pen'} ${p.color}, ${SIZE_NAME[p.size] ?? p.size}`;

export function PenPresets({ storageKey, current, disabled, onPick }: { storageKey?: string; current: { tool: string; color: string; size: number }; disabled?: boolean; onPick: (pen: PenPreset) => void }) {
  const [pens, setPens] = useState(() => readPens(storageKey));
  useEffect(() => {
    const refresh = (e: Event) => { if (!(e instanceof CustomEvent) || e.detail === storageKey) setPens(readPens(storageKey)); };
    const fromOtherTab = (e: StorageEvent) => { if (storageKey && e.key === storageKey) { latest.delete(storageKey); setPens(readPens(storageKey)); } };
    window.addEventListener(CHANGED, refresh); window.addEventListener('storage', fromOtherTab);
    return () => { window.removeEventListener(CHANGED, refresh); window.removeEventListener('storage', fromOtherTab); };
  }, [storageKey]);
  const update = (change: (latest: PenPreset[]) => PenPreset[]) => setPens(changePens(storageKey, change));
  const savable = (current.tool === 'pen' || current.tool === 'highlighter') && valid(current);
  const isCurrent = (p: PenPreset) => p.tool === current.tool && p.color.toLowerCase() === current.color.toLowerCase() && p.size === current.size;
  return <div className="nb-pens" role="group" aria-label="Favorite pens">
    {pens.map((p, i) => <span key={`${p.tool}${p.color}${p.size}${i}`} className="nb-pen">
      <button type="button" aria-label={label(p)} title={label(p)} aria-pressed={isCurrent(p)} disabled={disabled} onClick={() => onPick(p)}>
        <span className="nb-pen-dot" data-tool={p.tool} style={{ background: p.color, width: 6 + p.size, height: 6 + p.size }} />
      </button>
      <button type="button" className="nb-pen-remove" aria-label={`Remove ${label(p)}`} title="Remove this pen" disabled={disabled} onClick={() => update(latest => latest.filter(other => !same(other, p)))}><X size={10} /></button>
    </span>)}
    <button type="button" className="nb-tool" disabled={disabled || !savable || pens.some(p => same(p, current as PenPreset))} title={savable ? 'Save the current pen' : 'Choose a pen or highlighter to save it'}
      onClick={() => update(latest => latest.some(other => same(other, current as PenPreset)) ? latest : [...latest, { tool: current.tool as PenPreset['tool'], color: current.color, size: current.size }])}>Save pen</button>
  </div>;
}
