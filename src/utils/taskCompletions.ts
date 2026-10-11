// Every time a task was finished, with its proof and the review it got.
// The server appends to tasks.completion_history (a JSON array); tasks
// finished before that existed fall back to completion_notes/images.

export interface CompletionReview {
  status: 'approved' | 'changes_requested';
  by: number | null;
  at: string | null;
  note: string | null;
}

export interface TaskCompletion {
  by: number | null;
  at: string | null;
  notes: string | null;
  images: string[];
  review: CompletionReview | null;
}

const urls = (v: unknown): string[] =>
  // Same-origin paths only (/api/files/…, legacy /uploads/…): not "//host"
  // or "/\host", which browsers read as another site.
  Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && /^\/(?![\\/])/.test(u)) : [];

function parse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function readReview(v: any): CompletionReview | null {
  if (!v || (v.status !== 'approved' && v.status !== 'changes_requested')) return null;
  return { status: v.status, by: Number(v.by) || null, at: v.at ? String(v.at) : null, note: v.note ? String(v.note) : null };
}

/** The task's completions, newest first. */
export function taskCompletions(task: any): TaskCompletion[] {
  if (!task) return [];
  const list = parse(task.completion_history);
  if (Array.isArray(list) && list.length) {
    return list
      .filter((e) => e && typeof e === 'object')
      .map((e: any) => ({
        by: Number(e.by) || null,
        at: e.at ? String(e.at) : null,
        notes: e.notes ? String(e.notes) : null,
        images: urls(e.images),
        review: readReview(e.review),
      }))
      .reverse();
  }
  const notes = task.completion_notes ? String(task.completion_notes) : null;
  const images = urls(parse(task.completion_images));
  if (!notes && !images.length) return [];
  return [{
    by: Number(task.completed_by) || null,
    at: task.completed_at ? String(task.completed_at) : null,
    notes,
    images,
    review: readReview({ status: task.review_status, by: task.reviewed_by, at: task.reviewed_at, note: task.review_note }),
  }];
}
