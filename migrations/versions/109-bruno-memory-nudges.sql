-- 109-bruno-memory-nudges.sql — V3.5 Bruno memory and the morning nudge.
--   bruno_memories:    facts Bruno saved ("```remember"); scope 'user' rows
--                      belong to member_id, scope 'team' rows to the team.
--   members.bruno_nudges: 1 = send the 8 AM summary (default on).
--   bruno_nudges_sent: one row per member per team-local day (claimed with
--                      INSERT OR IGNORE so a nudge goes out once).
-- Additive only.

CREATE TABLE IF NOT EXISTS bruno_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  member_id INTEGER,
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bruno_memories_owner ON bruno_memories(team_id, scope, member_id);

ALTER TABLE members ADD COLUMN bruno_nudges INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS bruno_nudges_sent (
  member_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (member_id, day)
);
