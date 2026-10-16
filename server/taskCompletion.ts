// "Everyone assigned completes it separately" (tasks.completion_mode = 'each').

/**
 * "Everyone still assigned has finished their part", checked inside the
 * UPDATE that closes the task, so a person added at the same moment keeps it
 * open. Same rule as getTaskAssigneeIds (task_assignees, else the legacy
 * assigned_to). Use on the tasks table, unaliased.
 */
export const EVERYONE_DONE_SQL = `(
    (EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id)
      AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id
        AND NOT EXISTS (SELECT 1 FROM task_assignee_done d WHERE d.task_id = ta.task_id AND d.member_id = ta.member_id)))
    OR (NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id) AND tasks.assigned_to IS NOT NULL
      AND EXISTS (SELECT 1 FROM task_assignee_done d WHERE d.task_id = tasks.id AND d.member_id = tasks.assigned_to))
  )`;
