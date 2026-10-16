/**
 * Task statuses. "Open" means still to be done: To do and In progress.
 * Done and Cancelled are both closed; a cancelled task is kept (it can be
 * reopened) but never counts as open, overdue or late.
 *
 * Shared by the client and the server so "open" means the same everywhere.
 */
export const TASK_STATUSES = ['todo', 'in-progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses a task can be moved to directly (Done needs the completion dialog's proof). */
export const MOVABLE_STATUSES = ['todo', 'in-progress', 'cancelled'] as const;

export const CLOSED_STATUSES: readonly string[] = ['done', 'cancelled'];

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);
}

/** Still to be done (not finished, not cancelled). */
export function isOpenStatus(status: unknown): boolean {
  return !CLOSED_STATUSES.includes(String(status ?? 'todo'));
}


/** Work-in-progress limits for the board's open columns ({"in-progress": 4}). */
export type WipLimits = Partial<Record<'todo' | 'in-progress', number>>;
export const WIP_COLUMNS = ['todo', 'in-progress'] as const;
export const MAX_WIP = 99;

/** Valid limits only (whole numbers 1–99 for To do / In progress); anything else is dropped. */
export function cleanWipLimits(v: unknown): WipLimits {
  let obj: unknown = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { return {}; } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: WipLimits = {};
  for (const k of WIP_COLUMNS) {
    const n = Number((obj as any)[k]);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_WIP) out[k] = n;
  }
  return out;
}

/**
 * Strict check for a write: null or {} clears every limit; otherwise an object
 * whose keys are only "todo" / "in-progress" and whose values are whole numbers
 * 1–99 (or null, which removes that one). Anything else is refused (null result).
 */
export function strictWipLimits(v: unknown): WipLimits | null {
  if (v === null) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: WipLimits = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!(WIP_COLUMNS as readonly string[]).includes(k)) return null;
    if (raw === null) continue;
    if (!Number.isInteger(raw) || (raw as number) < 1 || (raw as number) > MAX_WIP) return null;
    out[k as 'todo' | 'in-progress'] = raw as number;
  }
  return out;
}
