BEGIN;
ALTER TABLE notebook_sections ADD COLUMN default_template TEXT;
ALTER TABLE notebook_sections ADD COLUMN date_stamp INTEGER NOT NULL DEFAULT 0 CHECK(date_stamp IN (0,1));
COMMIT;
