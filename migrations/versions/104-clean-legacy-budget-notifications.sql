-- 104-clean-legacy-budget-notifications.sql — budget notifications written
-- before the validation fix (#65) read "New budget expense: $$12314324 for":
-- a doubled dollar sign and a dangling "for" when the category was empty.
-- Current code can't produce either; this tidies the rows already stored.
-- Only notification text changes, and only on rows matching the old shape.

UPDATE notifications SET content = REPLACE(content, '$$', '$')
  WHERE content LIKE 'New budget %' AND content LIKE '%$$%';
UPDATE notifications SET content = RTRIM(SUBSTR(content, 1, LENGTH(content) - 4))
  WHERE content LIKE 'New budget %' AND content LIKE '% for';
