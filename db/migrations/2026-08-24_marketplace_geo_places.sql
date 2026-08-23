-- Additive marketplace geography foundation. Legacy Destination and
-- Product.destinationId remain unchanged until the later backfill/dual-read phase.
CREATE TABLE IF NOT EXISTS "GeoPlace" (
	"id" text PRIMARY KEY,
	"canonicalName" text NOT NULL,
	"normalizedName" text NOT NULL,
	"slug" text NOT NULL,
	"placeType" text NOT NULL,
	"countryCode" text NOT NULL,
	"parentId" text REFERENCES "GeoPlace" ("id"),
	"mergedIntoId" text REFERENCES "GeoPlace" ("id"),
	"centroidLat" real,
	"centroidLng" real,
	"boundingBoxJson" jsonb,
	"timezone" text,
	"status" text NOT NULL DEFAULT 'active',
	"source" text NOT NULL DEFAULT 'manual',
	"sourceRef" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "GeoPlace_country_parent_type_normalized_unique"
		UNIQUE NULLS NOT DISTINCT ("countryCode", "parentId", "placeType", "normalizedName"),
	CONSTRAINT "GeoPlace_placeType_check"
		CHECK ("placeType" IN ('country', 'admin_area_1', 'admin_area_2', 'city', 'locality', 'neighborhood', 'poi', 'natural_area')),
	CONSTRAINT "GeoPlace_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
	CONSTRAINT "GeoPlace_status_check" CHECK ("status" IN ('active', 'hidden', 'merged')),
	CONSTRAINT "GeoPlace_coordinates_check"
		CHECK (("centroidLat" IS NULL AND "centroidLng" IS NULL) OR ("centroidLat" BETWEEN -90 AND 90 AND "centroidLng" BETWEEN -180 AND 180)),
	CONSTRAINT "GeoPlace_parent_not_self_check" CHECK ("parentId" IS NULL OR "parentId" <> "id"),
	CONSTRAINT "GeoPlace_merge_not_self_check" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id")
);

CREATE TABLE IF NOT EXISTS "GeoPlaceClosure" (
	"ancestorId" text NOT NULL REFERENCES "GeoPlace" ("id") ON DELETE CASCADE,
	"descendantId" text NOT NULL REFERENCES "GeoPlace" ("id") ON DELETE CASCADE,
	"depth" integer NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "GeoPlaceClosure_pkey" PRIMARY KEY ("ancestorId", "descendantId"),
	CONSTRAINT "GeoPlaceClosure_depth_check" CHECK ("depth" >= 0),
	CONSTRAINT "GeoPlaceClosure_self_depth_check"
		CHECK (("ancestorId" = "descendantId" AND "depth" = 0) OR ("ancestorId" <> "descendantId" AND "depth" > 0))
);

CREATE TABLE IF NOT EXISTS "GeoPlaceAlias" (
	"id" text PRIMARY KEY,
	"placeId" text NOT NULL REFERENCES "GeoPlace" ("id") ON DELETE CASCADE,
	"locale" text NOT NULL DEFAULT 'es',
	"alias" text NOT NULL,
	"normalizedAlias" text NOT NULL,
	"aliasType" text NOT NULL DEFAULT 'alternate',
	"isPreferred" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "GeoPlaceAlias_aliasType_check"
		CHECK ("aliasType" IN ('primary', 'alternate', 'historic', 'transliteration', 'search'))
);

CREATE TABLE IF NOT EXISTS "GeoPlaceContent" (
	"id" text PRIMARY KEY,
	"placeId" text NOT NULL REFERENCES "GeoPlace" ("id") ON DELETE CASCADE,
	"locale" text NOT NULL DEFAULT 'es',
	"title" text,
	"summary" text,
	"seoJson" jsonb,
	"heroImageId" text REFERENCES "Image" ("id") ON DELETE SET NULL,
	"publicationStatus" text NOT NULL DEFAULT 'draft',
	"featuredRank" integer,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "GeoPlaceContent_publicationStatus_check"
		CHECK ("publicationStatus" IN ('draft', 'published', 'archived'))
);

CREATE TABLE IF NOT EXISTS "GeoPlaceExternalId" (
	"id" text PRIMARY KEY,
	"placeId" text NOT NULL REFERENCES "GeoPlace" ("id") ON DELETE CASCADE,
	"source" text NOT NULL,
	"externalId" text NOT NULL,
	"externalUrl" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ProductGeoPlace" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product" ("id") ON DELETE CASCADE,
	"placeId" text NOT NULL REFERENCES "GeoPlace" ("id"),
	"role" text NOT NULL DEFAULT 'primary_discovery',
	"isPrimary" boolean NOT NULL DEFAULT false,
	"source" text NOT NULL DEFAULT 'manual',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "ProductGeoPlace_role_check"
		CHECK ("role" IN ('primary_discovery', 'secondary_discovery', 'service_area', 'meeting_area')),
	CONSTRAINT "ProductGeoPlace_primary_role_check"
		CHECK ("isPrimary" = false OR "role" = 'primary_discovery')
);

CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlace_slug_unique" ON "GeoPlace" ("slug");
CREATE INDEX IF NOT EXISTS "GeoPlace_parent_type_status_idx"
	ON "GeoPlace" ("parentId", "placeType", "status");
CREATE INDEX IF NOT EXISTS "GeoPlace_country_type_status_idx"
	ON "GeoPlace" ("countryCode", "placeType", "status");
CREATE INDEX IF NOT EXISTS "GeoPlace_mergedIntoId_idx" ON "GeoPlace" ("mergedIntoId");
CREATE INDEX IF NOT EXISTS "GeoPlaceClosure_descendant_depth_idx"
	ON "GeoPlaceClosure" ("descendantId", "depth");
CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlaceAlias_place_locale_normalized_unique"
	ON "GeoPlaceAlias" ("placeId", "locale", "normalizedAlias");
CREATE INDEX IF NOT EXISTS "GeoPlaceAlias_normalized_locale_idx"
	ON "GeoPlaceAlias" ("normalizedAlias", "locale");
CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlaceContent_place_locale_unique"
	ON "GeoPlaceContent" ("placeId", "locale");
CREATE INDEX IF NOT EXISTS "GeoPlaceContent_status_rank_idx"
	ON "GeoPlaceContent" ("publicationStatus", "featuredRank");
CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlaceExternalId_source_external_unique"
	ON "GeoPlaceExternalId" ("source", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "GeoPlaceExternalId_place_source_external_unique"
	ON "GeoPlaceExternalId" ("placeId", "source", "externalId");
CREATE INDEX IF NOT EXISTS "GeoPlaceExternalId_place_source_idx"
	ON "GeoPlaceExternalId" ("placeId", "source");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductGeoPlace_product_place_role_unique"
	ON "ProductGeoPlace" ("productId", "placeId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductGeoPlace_one_primary_product_unique"
	ON "ProductGeoPlace" ("productId") WHERE "isPrimary" = true;
CREATE INDEX IF NOT EXISTS "ProductGeoPlace_place_role_product_idx"
	ON "ProductGeoPlace" ("placeId", "role", "productId");
CREATE INDEX IF NOT EXISTS "ProductGeoPlace_product_role_idx"
	ON "ProductGeoPlace" ("productId", "role");
