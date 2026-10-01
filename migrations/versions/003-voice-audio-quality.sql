-- 003-voice-audio-quality.sql
--
-- Adds `default_audio_quality` ('low' | 'medium' | 'high', default 'medium')
-- to team_voice_settings. The frontend WebRTC engine reads this setting and
-- applies the matching Opus maxbitrate to the audio RTCRtpSender, so the
-- team admin's audio-quality choice actually changes the wire bitrate.
--
-- Idempotency: the runner records each migration in schema_migrations and
-- never re-runs it, so a single guarded ALTER is safe here. ADD COLUMN does
-- not touch foreign keys (nothing references team_voice_settings), and the
-- DEFAULT backfills existing rows with 'medium' automatically.

ALTER TABLE team_voice_settings ADD COLUMN default_audio_quality TEXT DEFAULT 'medium';
