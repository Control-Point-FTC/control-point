// Counts the numbers inside a value up from 0 when it first appears (Modern
// only). "12 / 18", "$1,250" and "42%" keep their formatting; non-numeric text
// renders as-is. Respects prefers-reduced-motion.
import { useEffect, useRef, useState } from 'react';
import { useInterfaceMode } from './interfaceMode';

const NUM = /-?\d[\d,]*(?:\.\d+)?/g;

/** Replace every number in `text` with `t` (0..1) of its value, keeping format. */
export function interpolateNumbers(text: string, t: number): string {
  return text.replace(NUM, (m) => {
    const decimals = m.includes('.') ? m.split('.')[1].length : 0;
    const n = Number(m.replace(/,/g, ''));
    if (!Number.isFinite(n)) return m;
    const v = n * t;
    const fixed = decimals ? v.toFixed(decimals) : String(Math.round(v));
    return m.includes(',') ? Number(fixed).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : fixed;
  });
}

export function AnimatedValue({ value, duration = 700 }: { value: string | number; duration?: number }) {
  const { mode } = useInterfaceMode();
  const text = String(value);
  const hasNumber = /\d/.test(text);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = mode === 'modern' && hasNumber && !reduce;
  const [t, setT] = useState(animate ? 0 : 1);
  const raf = useRef(0);

  useEffect(() => {
    if (!animate) { setT(1); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setT(1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    setT(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // Re-run when the value itself changes.
  }, [text, animate, duration]);

  return <>{t >= 1 ? text : interpolateNumbers(text, t)}</>;
}
