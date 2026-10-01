-- 002: Discord-style voice & video calling.
--
-- voice_channels: team voice channels (Team Meeting, Strategy, ...).
-- voice_channel_role_perms: per-role overrides for view/join/speak/video/screenshare.
-- call_sessions: one row per active call (voice_channel | dm | group kind).
--   Voice-channel sessions are ephemeral: created on first join, ended when
--   the last participant leaves. DM/group sessions are created explicitly.
-- call_participants: join/leave history; left_at IS NULL = currently in call.
-- call_invites: ringing invites for DM/group calls.
-- call_moderation_log: audit trail for moderator actions.
-- team_voice_settings: per-team call feature flags and defaults.
--
-- Privacy: no media is ever recorded or stored. Signaling payloads (SDP/ICE)
-- are relayed in-memory over WebSocket and never persisted.

CREATE TABLE IF NOT EXISTS voice_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category_id INTEGER,
  position INTEGER DEFAULT 0,
  max_participants INTEGER DEFAULT 0, -- 0 = unlimited
  is_private INTEGER DEFAULT 0,
  locked INTEGER DEFAULT 0,           -- moderator lock: nobody new can join
  allow_video INTEGER DEFAULT 1,
  allow_screenshare INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(team_id) REFERENCES teams(id),
  FOREIGN KEY(category_id) REFERENCES channel_categories(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_voice_channels_team ON voice_channels(team_id, position, id);

CREATE TABLE IF NOT EXISTS voice_channel_role_perms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  can_view INTEGER DEFAULT 1,
  can_join INTEGER DEFAULT 1,
  can_speak INTEGER DEFAULT 1,
  can_video INTEGER DEFAULT 1,
  can_screenshare INTEGER DEFAULT 1,
  UNIQUE(channel_id, role_id),
  FOREIGN KEY(channel_id) REFERENCES voice_channels(id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS call_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'voice_channel', -- 'voice_channel' | 'dm' | 'group'
  channel_id INTEGER,                          -- set for voice_channel kind
  name TEXT DEFAULT '',
  created_by INTEGER,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,                               -- NULL = active
  locked INTEGER DEFAULT 0,
  global_spotlight_member_id INTEGER,
  max_participants INTEGER DEFAULT 0,
  FOREIGN KEY(team_id) REFERENCES teams(id),
  FOREIGN KEY(channel_id) REFERENCES voice_channels(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_call_sessions_team ON call_sessions(team_id, ended_at);

CREATE TABLE IF NOT EXISTS call_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT,                                -- NULL = currently in the call
  is_muted INTEGER DEFAULT 0,
  is_deafened INTEGER DEFAULT 0,
  camera_on INTEGER DEFAULT 0,
  sharing_screen INTEGER DEFAULT 0,
  connection_state TEXT DEFAULT 'connected',
  FOREIGN KEY(session_id) REFERENCES call_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_call_participants_session ON call_participants(session_id, left_at);

CREATE TABLE IF NOT EXISTS call_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  inviter_id INTEGER NOT NULL,
  invitee_id INTEGER NOT NULL,
  media TEXT NOT NULL DEFAULT 'audio',        -- 'audio' | 'video'
  status TEXT NOT NULL DEFAULT 'ringing',     -- 'ringing' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  FOREIGN KEY(session_id) REFERENCES call_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(inviter_id) REFERENCES members(id),
  FOREIGN KEY(invitee_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_call_invites_invitee ON call_invites(invitee_id, status);

CREATE TABLE IF NOT EXISTS call_moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  team_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  target_id INTEGER,
  action TEXT NOT NULL, -- 'mute' | 'deafen' | 'remove' | 'move' | 'stop_screen' | 'disable_video' | 'lock' | 'unlock' | 'end' | 'spotlight' | 'unspotlight'
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_call_mod_log_team ON call_moderation_log(team_id, created_at);

CREATE TABLE IF NOT EXISTS team_voice_settings (
  team_id INTEGER PRIMARY KEY,
  video_enabled INTEGER DEFAULT 1,
  screenshare_enabled INTEGER DEFAULT 1,
  global_spotlight_enabled INTEGER DEFAULT 1,
  dm_calls_allowed INTEGER DEFAULT 1,
  group_calls_allowed INTEGER DEFAULT 1,
  default_max_participants INTEGER DEFAULT 0,
  default_video_quality TEXT DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  call_timeout_minutes INTEGER DEFAULT 0,     -- 0 = no timeout
  reconnect_attempts INTEGER DEFAULT 5,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);
