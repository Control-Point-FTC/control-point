-- 101-notification-controls.sql — per-member notification preferences and
-- the queue behind team-update digests (audit item 26: one active user must
-- not spray everyone's inbox). Additive only.
--
-- Numbering: 010–019 are the V3 remediation's, 020–099 are reserved for
-- Muse's prediction work, so V3 continues at 101.

ALTER TABLE members ADD COLUMN notify_prefs TEXT;

CREATE TABLE IF NOT EXISTS notification_digest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  team_id INTEGER,
  kind TEXT NOT NULL,      -- 'budget' | 'outreach' | 'event'
  content TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL,
  claim TEXT,              -- set by the sweep that is sending this row
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_digest_member ON notification_digest(member_id, created_at);
