-- VariantCapacity is the canonical source for occupancy.
-- Preserve old profile-only overrides before removing the duplicate column.
INSERT INTO "VariantCapacity" (
	"variantId",
	"minOccupancy",
	"maxOccupancy",
	"maxAdults",
	"maxChildren"
)
SELECT
	"variantId",
	1,
	"maxOccupancyOverride",
	NULL,
	NULL
FROM "VariantRoomProfile"
WHERE "maxOccupancyOverride" IS NOT NULL
	AND "maxOccupancyOverride" > 0
	AND NOT EXISTS (
		SELECT 1
		FROM "VariantCapacity"
		WHERE "VariantCapacity"."variantId" = "VariantRoomProfile"."variantId"
	);

ALTER TABLE "VariantRoomProfile" DROP COLUMN "maxOccupancyOverride";
