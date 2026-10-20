-- 149-task-part-flags.sql — on an each-person task, the parts that need a
-- manager's review (Bruno didn't pass them). A row is written or removed in
-- the same batch as the member's task_assignee_done row, and the last part
-- closes the task approved only if no current assignee's done part has one.
-- A row without a matching done row (the task was reopened) is ignored and
-- replaced the next time that member finishes. Goes with its task or member.
CREATE TABLE IF NOT EXISTS task_part_flags (
  task_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, member_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
