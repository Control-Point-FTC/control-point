-- 127-maintenance-runs.sql — one-off maintenance jobs that ran on this database.
--
-- A job runs once: the server records it here (with a short JSON result) and
-- skips it on later starts. The first one deletes files left behind by
-- records deleted before files were deleted with them.

--
-- r2_pending_deletes: R2 objects whose database row is already gone but that
-- R2 refused to delete; a background job retries them.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance_runs (
  name TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL,
  result TEXT
);

CREATE TABLE IF NOT EXISTS r2_pending_deletes (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

COMMIT;
