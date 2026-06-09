-- Physical room/unit inventory is owned by VariantInventoryConfig.
-- VariantRoomProfile is guest-facing descriptive content only.
INSERT INTO "VariantInventoryConfig" (
	"variantId",
	"defaultTotalUnits",
	"horizonDays",
	"createdAt"
)
SELECT
	"variantId",
	CASE
		WHEN COALESCE("totalRooms", 0) > 0 THEN "totalRooms"
		ELSE 1
	END,
	365,
	CURRENT_TIMESTAMP
FROM "VariantRoomProfile"
WHERE NOT EXISTS (
	SELECT 1
	FROM "VariantInventoryConfig"
	WHERE "VariantInventoryConfig"."variantId" = "VariantRoomProfile"."variantId"
);

UPDATE "VariantInventoryConfig"
SET "defaultTotalUnits" = (
	SELECT
		CASE
			WHEN COALESCE("VariantRoomProfile"."totalRooms", 0) > 0 THEN "VariantRoomProfile"."totalRooms"
			ELSE "VariantInventoryConfig"."defaultTotalUnits"
		END
	FROM "VariantRoomProfile"
	WHERE "VariantRoomProfile"."variantId" = "VariantInventoryConfig"."variantId"
)
WHERE EXISTS (
	SELECT 1
	FROM "VariantRoomProfile"
	WHERE "VariantRoomProfile"."variantId" = "VariantInventoryConfig"."variantId"
		AND COALESCE("VariantRoomProfile"."totalRooms", 0) > 0
);

ALTER TABLE "VariantRoomProfile" DROP COLUMN "totalRooms";
