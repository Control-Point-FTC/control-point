// Shared chart styling for the Modern experience (recharts). Legacy charts keep
// their original look; Modern charts get gradient areas that draw in, a quiet
// horizontal-only grid, rounded bars and one consistent tooltip.
import type { CSSProperties } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useInterfaceMode } from './interfaceMode';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export interface ModernChartStyle {
  modern: boolean;
  accent: string;
  success: string;
  info: string;
  muted: string;
  grid: string;
  axis: string;
  /** Props for <Tooltip>. */
  tooltip: { contentStyle: CSSProperties; labelStyle: CSSProperties; itemStyle: CSSProperties; cursor: { stroke: string; strokeWidth: number } | { fill: string } };
  /** Props for <XAxis>/<YAxis>. */
  axisProps: { stroke: string; fontSize: number; tickLine: false; axisLine: false; tickMargin: number };
  animation: { isAnimationActive: boolean; animationDuration: number; animationEasing: 'ease-out' };
}

export function useChartStyle(): ModernChartStyle {
  const { theme } = useTheme();
  const { mode } = useInterfaceMode();
  const light = theme === 'light';
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const elevated = cssVar('--color-elevated', light ? '#ffffff' : '#151519');
  const text = cssVar('--color-text-base', light ? '#18181b' : '#fafaf8');
  const line = light ? 'rgba(10,10,12,0.08)' : 'rgba(255,255,255,0.07)';
  return {
    modern: mode === 'modern',
    accent: cssVar('--color-accent', '#ffc700'),
    success: cssVar('--color-success', '#34d399'),
    info: cssVar('--color-info', '#38bdf8'),
    muted: light ? '#a1a1aa' : '#52525b',
    grid: line,
    axis: light ? '#71717a' : '#8b8b94',
    tooltip: {
      contentStyle: {
        background: elevated,
        border: `1px solid ${light ? 'rgba(10,10,12,0.1)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: '0 12px 32px -12px rgba(0,0,0,0.45)',
        color: text,
        fontSize: 12,
      },
      labelStyle: { color: light ? '#5b5b63' : '#9a9aa3', marginBottom: 2, fontSize: 12 },
      itemStyle: { color: text, fontWeight: 600, padding: 0 },
      cursor: { stroke: line, strokeWidth: 1 },
    },
    axisProps: { stroke: light ? '#71717a' : '#8b8b94', fontSize: 12, tickLine: false, axisLine: false, tickMargin: 8 },
    animation: { isAnimationActive: !reduce, animationDuration: 900, animationEasing: 'ease-out' },
  };
}
