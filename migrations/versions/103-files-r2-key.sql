-- 103-files-r2-key.sql — where a stored file lives in Cloudflare R2 (owner
-- decision: files move to R2). A row with r2_key is served from R2; its
-- database copy stays until the owner turns on pruning (R2_PRUNE_DB=1), which
-- clears it only after R2's copy is verified. Additive only.

ALTER TABLE stored_files ADD COLUMN r2_key TEXT;
ALTER TABLE message_images ADD COLUMN r2_key TEXT;
