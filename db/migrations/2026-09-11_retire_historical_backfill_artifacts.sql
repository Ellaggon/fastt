-- Retire one-off backfill evidence after an operator has reviewed or exported it.
-- These tables have no runtime consumers; their originating migrations remain
-- the immutable historical explanation of the sanitation and category backfill.

DROP TABLE IF EXISTS "MarketplaceCatalogSanitationAudit";
DROP TABLE IF EXISTS "TourCategoryBackfillUnmapped";
