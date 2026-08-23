-- Geography phase 4: preserve every legacy destination while recording the
-- evidence that maps it, and products, to a canonical GeoPlace. This migration
-- is additive and intentionally does not alter Destination or Product.destinationId.

CREATE TABLE IF NOT EXISTS "LegacyDestinationGeoPlaceMap" (
	"id" text PRIMARY KEY,
	"legacyDestinationId" text NOT NULL REFERENCES "Destination" ("id"),
	"placeId" text REFERENCES "GeoPlace" ("id"),
	"resolutionStatus" text NOT NULL DEFAULT 'unmatched',
	"matchMethod" text NOT NULL DEFAULT 'unmatched',
	"confidence" integer NOT NULL DEFAULT 0,
	"distanceMeters" integer,
	"evidenceJson" jsonb,
	"catalogVersion" text,
	"reviewedByUserId" text REFERENCES "User" ("id"),
	"reviewedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "LegacyDestinationGeoPlaceMap_resolutionStatus_check"
		CHECK ("resolutionStatus" IN ('auto_matched', 'review_required', 'confirmed', 'unmatched', 'rejected')),
	CONSTRAINT "LegacyDestinationGeoPlaceMap_matchMethod_check"
		CHECK ("matchMethod" IN ('name_department', 'coordinates', 'name_coordinates', 'manual', 'unmatched')),
	CONSTRAINT "LegacyDestinationGeoPlaceMap_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
	CONSTRAINT "LegacyDestinationGeoPlaceMap_resolved_place_check"
		CHECK ("resolutionStatus" IN ('unmatched', 'rejected') OR "placeId" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "ProductGeoPlaceBackfill" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product" ("id") ON DELETE CASCADE,
	"placeId" text REFERENCES "GeoPlace" ("id"),
	"legacyDestinationMapId" text REFERENCES "LegacyDestinationGeoPlaceMap" ("id"),
	"resolutionStatus" text NOT NULL DEFAULT 'unmatched',
	"matchMethod" text NOT NULL DEFAULT 'unmatched',
	"confidence" integer NOT NULL DEFAULT 0,
	"distanceMeters" integer,
	"evidenceJson" jsonb,
	"catalogVersion" text,
	"appliedProductGeoPlaceId" text REFERENCES "ProductGeoPlace" ("id"),
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "ProductGeoPlaceBackfill_resolutionStatus_check"
		CHECK ("resolutionStatus" IN ('auto_matched', 'review_required', 'confirmed', 'unmatched', 'superseded')),
	CONSTRAINT "ProductGeoPlaceBackfill_matchMethod_check"
		CHECK ("matchMethod" IN ('legacy_destination', 'coordinates', 'address_coordinates', 'manual', 'unmatched')),
	CONSTRAINT "ProductGeoPlaceBackfill_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
	CONSTRAINT "ProductGeoPlaceBackfill_resolved_place_check"
		CHECK ("resolutionStatus" IN ('unmatched', 'superseded') OR "placeId" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegacyDestinationGeoPlaceMap_legacyDestination_unique"
	ON "LegacyDestinationGeoPlaceMap" ("legacyDestinationId");
CREATE INDEX IF NOT EXISTS "LegacyDestinationGeoPlaceMap_place_status_idx"
	ON "LegacyDestinationGeoPlaceMap" ("placeId", "resolutionStatus");
CREATE INDEX IF NOT EXISTS "LegacyDestinationGeoPlaceMap_status_confidence_idx"
	ON "LegacyDestinationGeoPlaceMap" ("resolutionStatus", "confidence");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductGeoPlaceBackfill_product_unique"
	ON "ProductGeoPlaceBackfill" ("productId");
CREATE INDEX IF NOT EXISTS "ProductGeoPlaceBackfill_place_status_idx"
	ON "ProductGeoPlaceBackfill" ("placeId", "resolutionStatus");
CREATE INDEX IF NOT EXISTS "ProductGeoPlaceBackfill_status_confidence_idx"
	ON "ProductGeoPlaceBackfill" ("resolutionStatus", "confidence");
