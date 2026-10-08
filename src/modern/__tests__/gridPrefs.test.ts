import { describe, it, expect, beforeEach } from 'vitest';
import { GRID_DEFAULTS, applyGridPrefs, readGridPrefs, saveGridPrefs } from '../gridPrefs';

beforeEach(() => { localStorage.clear(); document.documentElement.className = ''; document.documentElement.removeAttribute('style'); });

describe('grid preferences', () => {
  it('defaults anything missing, unknown or out of range', () => {
    expect(readGridPrefs(null)).toEqual(GRID_DEFAULTS);
    expect(readGridPrefs('not json')).toEqual(GRID_DEFAULTS);
    // Valid JSON that isn't an object must not crash startup.
    expect(readGridPrefs('null')).toEqual(GRID_DEFAULTS);
    expect(readGridPrefs('42')).toEqual(GRID_DEFAULTS);
    expect(readGridPrefs('[1,2]')).toEqual(GRID_DEFAULTS);
    const p = readGridPrefs(JSON.stringify({ style: 'stars', size: 999, intensity: -1, thickness: 7, fade: 'forever', pulseSpeed: 0 }));
    expect(p.style).toBe('lines');
    expect(p.size).toBe(80);
    expect(p.intensity).toBe(0.02);
    expect(p.thickness).toBe(2);
    expect(p.fade).toBe('medium');
    expect(p.pulseSpeed).toBe(2);
  });

  it('applies as classes and CSS variables on <html>, and persists', () => {
    saveGridPrefs({ ...GRID_DEFAULTS, style: 'dots', size: 40, intensity: 0.15, thickness: 2, fade: 'none', pulse: true, glow: true });
    const root = document.documentElement;
    expect(root.classList.contains('cp-grid-dots')).toBe(true);
    expect(root.classList.contains('cp-grid-lines')).toBe(false);
    expect(root.classList.contains('cp-grid-nofade')).toBe(true);
    expect(root.classList.contains('cp-grid-pulse')).toBe(true);
    expect(root.classList.contains('cp-grid-glow')).toBe(true);
    expect(root.style.getPropertyValue('--cp-grid-size')).toBe('40px');
    expect(root.style.getPropertyValue('--cp-grid-alpha')).toBe('0.15');
    expect(root.style.getPropertyValue('--cp-grid-width')).toBe('2px');
    expect(readGridPrefs()).toMatchObject({ style: 'dots', size: 40 });
  });

  it('turning the grid off clears style, pulse and glow', () => {
    applyGridPrefs({ ...GRID_DEFAULTS, enabled: false, pulse: true, glow: true });
    const root = document.documentElement;
    expect(root.classList.contains('cp-grid-off')).toBe(true);
    expect(root.classList.contains('cp-grid-lines')).toBe(false);
    expect(root.classList.contains('cp-grid-pulse')).toBe(false);
    expect(root.classList.contains('cp-grid-glow')).toBe(false);
  });

  it('pulse origins: known ones in order, never none, applied only while pulsing', () => {
    expect(readGridPrefs(JSON.stringify({ pulseFrom: ['corners', 'bogus', 'center'] })).pulseFrom).toEqual(['center', 'corners']);
    expect(readGridPrefs(JSON.stringify({ pulseFrom: [] })).pulseFrom).toEqual(['center', 'edges', 'corners']);
    expect(readGridPrefs(JSON.stringify({ pulseFrom: 'edges' })).pulseFrom).toEqual(['center', 'edges', 'corners']);
    const root = document.documentElement;
    applyGridPrefs({ ...GRID_DEFAULTS, pulse: true, pulseFrom: ['edges'] });
    expect(['center', 'edges', 'corners'].map((k) => root.classList.contains(`cp-pulse-${k}`))).toEqual([false, true, false]);
    applyGridPrefs({ ...GRID_DEFAULTS, pulse: false, pulseFrom: ['edges'] });
    expect(root.classList.contains('cp-pulse-edges')).toBe(false);
    applyGridPrefs({ ...GRID_DEFAULTS, enabled: false, pulse: true });
    expect(root.classList.contains('cp-pulse-center')).toBe(false);
  });
});
