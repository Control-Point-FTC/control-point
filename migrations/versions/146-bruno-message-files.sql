-- 146-bruno-message-files.sql — images and PDFs attached to a Bruno message.
-- The bytes live in stored_files (kind 'bruno', R2 when configured); this
-- links each file to its chat and message, in the order it was attached.
-- Text files need no row: they are part of the message text itself.
BEGIN;

CREATE TABLE IF NOT EXISTS bruno_message_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bruno_message_files_chat ON bruno_message_files (chat_id, message_id, position);
CREATE INDEX IF NOT EXISTS idx_bruno_message_files_file ON bruno_message_files (file_id);

COMMIT;
