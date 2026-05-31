-- Rooms v2 foundation:
-- Create canonical room profile tables before legacy cleanup/backfill runs.
-- Safe to re-run: tables and indexes are idempotent.

CREATE TABLE IF NOT EXISTS "VariantRoomProfile" (
	"variantId" TEXT PRIMARY KEY NOT NULL REFERENCES "Variant" ("id"),
	"roomTypeId" TEXT REFERENCES "RoomType" ("id"),
	"totalRooms" INTEGER DEFAULT 0 NOT NULL,
	"sizeM2" REAL,
	"viewType" TEXT,
	"bathroomCount" INTEGER,
	"bathroomType" TEXT,
	"hasBalcony" INTEGER,
	"maxOccupancyOverride" INTEGER,
	"guestFacingNotes" TEXT,
	"createdAt" INTEGER DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" INTEGER DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "VariantRoomProfile_roomTypeId_idx"
	ON "VariantRoomProfile" ("roomTypeId");

CREATE TABLE IF NOT EXISTS "VariantRoomBed" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"bedType" TEXT NOT NULL,
	"count" INTEGER DEFAULT 1 NOT NULL,
	"roomLabel" TEXT,
	"sortOrder" INTEGER DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "VariantRoomBed_variantId_idx"
	ON "VariantRoomBed" ("variantId");

CREATE TABLE IF NOT EXISTS "VariantRoomAmenity" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"amenityId" TEXT NOT NULL REFERENCES "AmenityRoom" ("id"),
	"isAvailable" INTEGER DEFAULT 1 NOT NULL,
	"notes" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "VariantRoomAmenity_variantId_amenityId_idx"
	ON "VariantRoomAmenity" ("variantId", "amenityId");
