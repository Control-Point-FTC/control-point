// Task start date and tags (subsystems, awards, labels): one validator for
// POST/PATCH /api/tasks and Bruno's task proposals, so every path saves
// the same thing. Tags are stored as JSON arrays; an empty list is NULL.
import { cleanAwards, cleanLabels, cleanRecordSubsystems, isRealDate } from "../src/types/taskTags.js";

export const TASK_TAG_FIELDS = ["start_date", "subsystems", "awards", "labels"] as const;
export type TaskTagField = (typeof TASK_TAG_FIELDS)[number];

/** A real YYYY-MM-DD calendar date. */
export const isTaskDate = isRealDate;

const asJson = (list: string[]) => (list.length ? JSON.stringify(list) : null);

/**
 * The column values for the tag fields present in `body` (absent fields are
 * left out, so a PATCH only touches what it sent). Subsystems must be on the
 * team's list; unknown awards and extra labels are dropped.
 */
export function taskTagColumns(body: any, teamSubsystems: readonly string[]): { cols: Partial<Record<TaskTagField, string | null>>; error?: string } {
  const cols: Partial<Record<TaskTagField, string | null>> = {};
  if (!body || typeof body !== "object") return { cols };
  if (body.start_date !== undefined) {
    if (body.start_date === null || body.start_date === "") cols.start_date = null;
    else if (isTaskDate(body.start_date)) cols.start_date = body.start_date;
    else return { cols, error: "Use a start date like 2026-10-20" };
  }
  if (body.subsystems !== undefined) cols.subsystems = asJson(cleanRecordSubsystems(body.subsystems ?? [], teamSubsystems));
  if (body.awards !== undefined) cols.awards = asJson(cleanAwards(body.awards ?? []));
  if (body.labels !== undefined) cols.labels = asJson(cleanLabels(body.labels ?? []));
  return { cols };
}

/** A start date after the due date is almost always a typo. */
export function startAfterDue(start: string | null | undefined, due: string | null | undefined): boolean {
  return !!start && !!due && isTaskDate(start) && String(due).slice(0, 10) < start;
}
