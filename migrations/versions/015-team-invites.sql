-- 015-team-invites.sql — join links ("invites") and join requests.
--
-- An invite is a revocable, optionally expiring and use-limited link that
-- adds people to a workspace without showing them the access code. Only a
-- SHA-256 hash of the link token is stored. Join requests hold people who
-- used a link that needs approval (and, later, people asking to join a
-- workspace that already owns their FTC team number). Additive only.

CREATE TABLE IF NOT EXISTS team_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  label TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id);

CREATE TABLE IF NOT EXISTS team_join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  -- Set only when a brand-new account signed up through an approval link:
  -- the account is created from this when the request is approved.
  password_hash TEXT,
  invite_id INTEGER,
  source TEXT NOT NULL DEFAULT 'invite',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_by INTEGER,
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_join_requests_team ON team_join_requests(team_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_pending
  ON team_join_requests(team_id, email) WHERE status = 'pending';
