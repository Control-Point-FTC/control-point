-- 143-checklists.sql — Checklists (src/types/checklists.ts):
--   checklist_templates   a team's reusable lists (sections of items, JSON)
--   checklist_runs        one use of a template, with its own copy of the
--                         sections (editing the template never changes a run),
--                         optionally tied to a calendar event
--   checklist_run_items   each item's state in a run: who set it and when,
--                         an optional note and assignee
BEGIN;

CREATE TABLE IF NOT EXISTS checklist_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sections TEXT NOT NULL,
  starter TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_team ON checklist_templates (team_id, archived_at);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  template_id INTEGER,
  title TEXT NOT NULL,
  sections TEXT NOT NULL,
  event_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  started_by INTEGER,
  started_at TEXT NOT NULL,
  finished_by INTEGER,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_team ON checklist_runs (team_id, status, started_at);

CREATE TABLE IF NOT EXISTS checklist_run_items (
  run_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  note TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER,
  set_by INTEGER,
  set_at TEXT,
  PRIMARY KEY (run_id, item_id),
  FOREIGN KEY (run_id) REFERENCES checklist_runs(id) ON DELETE CASCADE
);

COMMIT;
