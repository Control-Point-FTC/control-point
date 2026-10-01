import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Batches a fast producer (AI stream chunks) into slower React state updates.
 *
 * Chunks accumulate in a ref and are flushed to state at most once per
 * `flushMs`. This keeps per-token `setState` calls (and the full chat
 * re-render + Markdown re-parse they trigger) from happening dozens of
 * times per second, while the visible text still updates smoothly.
 */
export interface BatchedStream {
  /** Visible text of the in-flight stream ('' when idle). */
  text: string;
  /** True while a stream is in flight, even before the first chunk. */
  active: boolean;
  /** Begin a new stream; clears any previous state. */
  start: () => void;
  /** Feed one chunk; visible text updates at most once per `flushMs`. */
  push: (chunk: string) => void;
  /** End the stream and reset display state (idempotent). */
  finish: () => void;
}

export function useBatchedStream(flushMs = 40): BatchedStream {
  const [text, setText] = useState('');
  const [active, setActive] = useState(false);
  const pendingRef = useRef('');
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    timerRef.current = null;
    setText(pendingRef.current);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const push = useCallback(
    (chunk: string) => {
      pendingRef.current += chunk;
      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(flush, flushMs);
      }
    },
    [flush, flushMs],
  );

  const start = useCallback(() => {
    clearTimer();
    pendingRef.current = '';
    setText('');
    setActive(true);
  }, [clearTimer]);

  const finish = useCallback(() => {
    clearTimer();
    pendingRef.current = '';
    setText('');
    setActive(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { text, active, start, push, finish };
}
