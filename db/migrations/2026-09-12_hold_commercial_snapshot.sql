-- A hold is the commercial boundary between search and checkout. New holds
-- persist the accepted PriceQuote and full pricing snapshot with the inventory
-- locks, so cache availability cannot change the booked guest total.

ALTER TABLE "Hold"
	ADD COLUMN IF NOT EXISTS "commercialSnapshotVersion" text NOT NULL DEFAULT 'legacy',
	ADD COLUMN IF NOT EXISTS "priceQuoteId" text,
	ADD COLUMN IF NOT EXISTS "commercialSnapshotJson" jsonb;

ALTER TABLE "Hold"
	DROP CONSTRAINT IF EXISTS "Hold_commercial_snapshot_check";
ALTER TABLE "Hold"
	ADD CONSTRAINT "Hold_commercial_snapshot_check"
	CHECK (
		("commercialSnapshotVersion" = 'legacy' AND "priceQuoteId" IS NULL AND "commercialSnapshotJson" IS NULL)
		OR
		("commercialSnapshotVersion" = 'hold_commercial_snapshot_v1' AND "priceQuoteId" IS NOT NULL AND "commercialSnapshotJson" IS NOT NULL AND ("commercialSnapshotJson" -> 'priceQuote' ->> 'quoteId') = "priceQuoteId")
	);

CREATE INDEX IF NOT EXISTS "Hold_priceQuoteId_idx" ON "Hold" ("priceQuoteId");
