-- 127-maintenance-runs.sql — one-off maintenance jobs that ran on this database.
--
-- A job runs once: the server records it here (with a short JSON result) and
-- skips it on later starts. The first one deletes files left behind by
-- records deleted before files were deleted with them.

CREATE TABLE IF NOT EXISTS maintenance_runs (
  name TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL,
  result TEXT
);
