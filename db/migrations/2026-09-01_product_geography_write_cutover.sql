-- Block 4, step 1: products are now created through ProductGeoPlace.
-- Keep the legacy column temporarily nullable so existing historical rows remain
-- readable while all runtime consumers are migrated and audited.
ALTER TABLE "Product"
	ALTER COLUMN "destinationId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "ProductGeoPlace_primary_discovery_idx"
	ON "ProductGeoPlace" ("productId", "placeId")
	WHERE "role" = 'primary_discovery' AND "isPrimary" = true;
