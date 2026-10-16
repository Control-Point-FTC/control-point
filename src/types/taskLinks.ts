/**
 * Task links shared by the client and the server: the kinds a task can have
 * (blocked by, blocks, related) and a cleaner for lists of task ids as Bruno
 * or a form sends them ("#12", 12, "12").
 */
export const LINK_KINDS = ['blocked_by', 'blocks', 'related'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const MAX_LINKS_PER_TASK = 20;

/** Task ids, de-duplicated, without `self`, at most 20. */
export function cleanTaskIds(v: unknown, self?: number): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = typeof x === 'number' ? x : parseInt(String(x ?? '').replace(/^#/, ''), 10);
    if (Number.isSafeInteger(n) && n > 0 && n !== self && !out.includes(n)) out.push(n);
    if (out.length >= MAX_LINKS_PER_TASK) break;
  }
  return out;
}

/** Is a task blocked? Some task that blocks it is still open (in `byId`). */
export function isBlockedBy(blockedBy: readonly number[] | undefined, isOpen: (id: number) => boolean): boolean {
  return !!blockedBy?.some(isOpen);
}
