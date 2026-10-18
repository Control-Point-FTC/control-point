import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AUTO_APPLY_KEY, itemRemoves, readAutoApply, useBrunoAutoApply } from '../autoApply';

describe('auto-apply', () => {
  afterEach(() => { vi.restoreAllMocks(); try { localStorage.removeItem(AUTO_APPLY_KEY); } catch { /* */ } });

  it('treats every removal format as a removal (they always wait for a click)', () => {
    expect(itemRemoves({ remove: 17 })).toBe(true);
    expect(itemRemoves({ delete: true })).toBe(true);
    expect(itemRemoves({ op: 'delete' })).toBe(true);
    expect(itemRemoves({ title: 'Build night', remove: false })).toBe(false);
    expect(itemRemoves({ title: 'Build night' })).toBe(false);
  });

  it('keeps the switch on for this tab when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useBrunoAutoApply());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(readAutoApply()).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
