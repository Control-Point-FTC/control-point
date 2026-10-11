/**
 * A single HTTP byte range ("bytes=a-b", "bytes=a-" or "bytes=-n") against a
 * body of `size` bytes: the inclusive span to send with 206, "unsatisfiable"
 * for 416, or null to send the whole body (no header, several ranges, or
 * anything unreadable). Videos need this to play and seek (Safari won't play
 * a video served without range support).
 */
export function byteRange(header: unknown, size: number): { start: number; end: number } | "unsatisfiable" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (!m[1] && !m[2]) || size <= 0) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    // "bytes=-n": the last n bytes.
    const n = Number(m[2]);
    if (!n) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
