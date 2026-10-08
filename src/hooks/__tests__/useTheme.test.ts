import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme, THEME_STORAGE_KEY } from '../useTheme';

// A controllable prefers-color-scheme.
let light = false;
const listeners = new Set<() => void>();
const had = window.matchMedia;
beforeEach(() => {
  light = false;
  listeners.clear();
  localStorage.clear();
  document.documentElement.classList.remove('light');
  window.matchMedia = ((q: string) => ({
    get matches() { return q.includes('light') ? light : false; },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as any;
});
afterEach(() => { window.matchMedia = had; });

describe('useTheme: System', () => {
  it('follows the device, and keeps following it until a fixed theme is picked', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(result.current.choice).toBe('system');
    expect(result.current.theme).toBe('dark');
    // The device switches to light.
    act(() => { light = true; listeners.forEach((fn) => fn()); });
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    // A fixed choice stops following.
    act(() => result.current.setTheme('dark'));
    act(() => { light = true; listeners.forEach((fn) => fn()); });
    expect(result.current.theme).toBe('dark');
    expect(result.current.choice).toBe('dark');
  });

  it('a saved "system" resolves on load', () => {
    light = true;
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.choice).toBe('system');
  });
});
