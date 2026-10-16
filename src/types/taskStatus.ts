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

