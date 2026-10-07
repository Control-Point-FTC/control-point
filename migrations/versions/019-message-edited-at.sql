-- 019-message-edited-at.sql — when an author last edited their message, so
-- the chat can show "(edited)". Moderator corrections stay silent and don't
-- set it. Additive only.

ALTER TABLE messages ADD COLUMN edited_at TEXT;
