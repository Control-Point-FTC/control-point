-- 110-inventory-purchase-links.sql — V3.5 phase 5 inventory.
--   url:      where to order the part (a product page). NULL = use the
--             supplier's page for the SKU (src/utils/suppliers.ts).
--   supplier: supplier id from src/utils/suppliers.ts ('rev', 'gobilda', …).
--             NULL = detect from the link, SKU format or name.
-- Additive only.

ALTER TABLE inventory ADD COLUMN url TEXT;
ALTER TABLE inventory ADD COLUMN supplier TEXT;
