-- Rooms v2 finalization:
-- VariantRoomProfile.roomTypeId is the canonical hotel-room subtype field.
-- VariantHotelRoom was a transitional mirror and is removed after backfill.

BEGIN TRANSACTION;
PRAGMA foreign_keys = OFF;

UPDATE "VariantRoomProfile"
SET
	"roomTypeId" = (
		SELECT "VariantHotelRoom"."roomTypeId"
		FROM "VariantHotelRoom"
		WHERE "VariantHotelRoom"."variantId" = "VariantRoomProfile"."variantId"
	),
	"updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
	SELECT 1
	FROM "VariantHotelRoom"
	WHERE "VariantHotelRoom"."variantId" = "VariantRoomProfile"."variantId"
		AND "VariantHotelRoom"."roomTypeId" IS NOT NULL
);

INSERT INTO "VariantRoomProfile" (
	"variantId",
	"roomTypeId",
	"totalRooms",
	"createdAt",
	"updatedAt"
)
SELECT
	"VariantHotelRoom"."variantId",
	"VariantHotelRoom"."roomTypeId",
	0,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP
FROM "VariantHotelRoom"
WHERE "VariantHotelRoom"."roomTypeId" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "VariantRoomProfile"
		WHERE "VariantRoomProfile"."variantId" = "VariantHotelRoom"."variantId"
	);

DROP TABLE IF EXISTS "VariantHotelRoom";

PRAGMA foreign_keys = ON;
COMMIT;
