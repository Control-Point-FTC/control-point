import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBatchedStream } from '../useBatchedStream';

afterEach(() => {
  vi.useRealTimers();
});

describe('useBatchedStream', () => {
  it('batches many rapid pushes into few state updates', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBatchedStream(40));

    act(() => result.current.start());
    expect(result.current.active).toBe(true);

    // 100 chunks pushed synchronously — the old code would setState 100x.
    act(() => {
      for (let i = 0; i < 100; i++) result.current.push(`tok${i} `);
    });
    // Nothing flushed yet: still a single pending timer.
    expect(result.current.text).toBe('');

    act(() => vi.advanceTimersByTime(40));
    expect(result.current.text).toContain('tok0');
    expect(result.current.text).toContain('tok99');

    // Pushing more schedules exactly one more flush.
    act(() => {
      result.current.push('more ');
      result.current.push('chunks ');
    });
    act(() => vi.advanceTimersByTime(40));
    expect(result.current.text).toContain('more chunks');

    act(() => result.current.finish());
    expect(result.current.active).toBe(false);
    expect(result.current.text).toBe('');
  });

  it('finish() is idempotent and clears pending timers', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBatchedStream(40));

    act(() => {
      result.current.start();
      result.current.push('hello ');
      result.current.finish();
      result.current.finish();
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.active).toBe(false);
    expect(result.current.text).toBe('');
  });

  it('start() resets state from a previous stream', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBatchedStream(40));

    act(() => {
      result.current.start();
      result.current.push('old ');
    });
    act(() => vi.advanceTimersByTime(40));
    expect(result.current.text).toBe('old ');

    act(() => result.current.start());
    expect(result.current.text).toBe('');
    act(() => {
      result.current.push('new ');
    });
    act(() => vi.advanceTimersByTime(40));
    expect(result.current.text).toBe('new ');
  });

  it('unmount clears the pending timer without crashing', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useBatchedStream(40));
    act(() => {
      result.current.start();
      result.current.push('x');
    });
    expect(() => unmount()).not.toThrow();
    act(() => vi.advanceTimersByTime(1000));
  });
});
