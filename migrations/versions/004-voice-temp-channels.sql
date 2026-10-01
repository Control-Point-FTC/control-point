-- 004-voice-temp-channels.sql
-- Marks ad-hoc "call a member" voice channels so the server can clean them up
-- when the call ends. A temp channel is a normal public voice channel while it
-- lives: anyone on the team with voice access can see it and join it.

ALTER TABLE voice_channels ADD COLUMN is_temporary INTEGER DEFAULT 0;
