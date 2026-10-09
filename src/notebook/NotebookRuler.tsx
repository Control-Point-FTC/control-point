import React, { useRef } from 'react';
import type { Point } from './canvasModel';
import { roundCanvas } from './canvasGeometry';

export type Ruler = { x: number; y: number; angle: number };
export function snapToRuler(point: Point, ruler: Ruler): Point {
  const angle = ruler.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const dx = point[0] - ruler.x - 180, dy = point[1] - ruler.y - 16;
  const x = dx * c + dy * s + 180, y = -dx * s + dy * c + 16;
  const edge = Math.abs(y) < Math.abs(y - 32) ? 0 : 32;
  if (x < -12 || x > 372 || Math.abs(y - edge) > 12) return point;
  return [roundCanvas(ruler.x + 180 + (x - 180) * c - (edge - 16) * s), roundCanvas(ruler.y + 16 + (x - 180) * s + (edge - 16) * c), point[2]];
}
export function NotebookRuler({ value, onChange }: { value: Ruler; onChange: (value: Ruler) => void }) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ value: Ruler; center: { x: number; y: number }; angle: number; rotate: boolean } | null>(null);
  const point = (e: React.PointerEvent) => {
    const stage = e.currentTarget.parentElement!, rect = stage.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * stage.offsetWidth / rect.width, y: (e.clientY - rect.top) * stage.offsetHeight / rect.height };
  };
  const center = () => { const p = [...pointers.current.values()]; return { x: p.reduce((sum, v) => sum + v.x, 0) / p.length, y: p.reduce((sum, v) => sum + v.y, 0) / p.length }; };
  const angle = () => { const p = [...pointers.current.values()]; return p.length === 2 ? Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x) : Math.atan2(p[0].y-value.y-16,p[0].x-value.x-180); };
  const rebase = (rotate = false) => { gesture.current = { value, center: center(), angle: angle(), rotate }; };
  const finish = (e: React.PointerEvent) => {
    e.stopPropagation(); pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (pointers.current.size) rebase(); else gesture.current = null;
  };
  return <div className="nb-ruler" role="group" aria-label="Drawing ruler" style={{ left: value.x, top: value.y, transform: `rotate(${value.angle}deg)` }} onPointerDown={e => {
    e.preventDefault(); e.stopPropagation();
    if (pointers.current.size >= 2) return;
    pointers.current.set(e.pointerId, point(e)); e.currentTarget.setPointerCapture(e.pointerId);
    rebase((e.target as Element).hasAttribute('data-ruler-rotate'));
  }} onPointerMove={e => {
    e.stopPropagation(); if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, point(e)); const g = gesture.current;
    if (pointers.current.size === 2 || g.rotate) {
      const rotation = g.value.angle + (angle()-g.angle)*180/Math.PI;
      onChange({ ...g.value, angle: roundCanvas(((rotation+540)%360)-180) });
    } else { const p = center(); onChange({ ...g.value, x: Math.max(0,roundCanvas(g.value.x+p.x-g.center.x)), y: Math.max(0,roundCanvas(g.value.y+p.y-g.center.y)) }); }
  }} onPointerUp={finish} onPointerCancel={finish}>
    <span className="nb-ruler-ticks" aria-hidden="true" />
    <span className="nb-ruler-label">{Math.round(value.angle)}° · Drag to move</span>
    <span role="button" tabIndex={0} aria-label="Rotate ruler" data-ruler-rotate onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onChange({ ...value, angle: Math.max(-180,Math.min(180,value.angle+(e.key === 'ArrowRight' ? 5 : -5))) }); } }} className="nb-ruler-rotate">↻</span>
  </div>;
}
