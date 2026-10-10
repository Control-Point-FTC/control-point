// Insert → Table: pick a size on a grid (hover or arrow keys), like paper
// notebooks' table pickers. Enter or a click inserts it with a header row.
import React, { useEffect, useRef, useState } from 'react';

export const GRID_COLS = 8, GRID_ROWS = 6;

export function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [at, setAt] = useState({ rows: 3, cols: 3 });
  const grid = useRef<HTMLDivElement>(null);
  // The menu focuses itself first; then the grid takes the keyboard.
  useEffect(() => { const frame = requestAnimationFrame(() => grid.current?.focus()); return () => cancelAnimationFrame(frame); }, []);
  const move = (e: React.KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(at.rows, at.cols); return; }
    const d = step[e.key];
    if (!d) return;
    // Keep arrows inside the grid instead of moving through the menu.
    e.preventDefault(); e.stopPropagation();
    setAt(p => ({ rows: Math.max(1, Math.min(GRID_ROWS, p.rows + d[0])), cols: Math.max(1, Math.min(GRID_COLS, p.cols + d[1])) }));
  };
  return <div className="nb-table-grid-wrap">
    <div ref={grid} className="nb-table-grid" role="group" tabIndex={0} aria-label={`Table size: ${at.rows} rows by ${at.cols} columns. Arrow keys change it; Enter inserts.`} onKeyDown={move}
      style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 16px)` }}>
      {Array.from({ length: GRID_ROWS }, (_, r) => Array.from({ length: GRID_COLS }, (_, c) =>
        <button key={`${r}:${c}`} type="button" tabIndex={-1} aria-label={`${r + 1} by ${c + 1} table`} data-on={r < at.rows && c < at.cols || undefined}
          onMouseEnter={() => setAt({ rows: r + 1, cols: c + 1 })} onFocus={() => setAt({ rows: r + 1, cols: c + 1 })}
          onClick={() => onPick(r + 1, c + 1)} />))}
    </div>
    <p className="nb-table-grid-size" aria-hidden="true">{at.rows} × {at.cols} table</p>
  </div>;
}
