-- The canonical rich document is retained alongside its merge history.
-- Replacing/restoring content clears state and changes epoch: an old device
-- must recover its changes explicitly, never resurrect text after a restore.
ALTER TABLE notebook_pages ADD COLUMN crdt_state BLOB;
ALTER TABLE notebook_pages ADD COLUMN crdt_epoch TEXT;
