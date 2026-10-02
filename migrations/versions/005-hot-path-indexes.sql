-- 005-hot-path-indexes.sql
-- Adds missing indexes on the hottest query paths. All statements are plain
-- CREATE INDEX IF NOT EXISTS: no table rebuilds, no renames, fully idempotent.
-- member_roles(member_id) is the big one: hasPerm() hits it on every
-- authenticated request.

CREATE INDEX IF NOT EXISTS idx_member_roles_member ON member_roles(member_id);
CREATE INDEX IF NOT EXISTS idx_chat_channels_team ON chat_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_channel_categories_team ON channel_categories(team_id);
CREATE INDEX IF NOT EXISTS idx_code_files_team ON code_files(team_id);
CREATE INDEX IF NOT EXISTS idx_code_repos_team ON code_repos(team_id);
CREATE INDEX IF NOT EXISTS idx_code_commits_file ON code_commits(file_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_team ON inventory(team_id);
CREATE INDEX IF NOT EXISTS idx_cad_reviews_team ON cad_reviews(team_id);
CREATE INDEX IF NOT EXISTS idx_cad_parts_team ON cad_parts(team_id);
CREATE INDEX IF NOT EXISTS idx_outreach_team ON outreach(team_id);
CREATE INDEX IF NOT EXISTS idx_team_voice_settings_team ON team_voice_settings(team_id);
