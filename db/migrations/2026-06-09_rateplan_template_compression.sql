-- Compress one-off RatePlanTemplate rows into RatePlan.
ALTER TABLE "RatePlan"
	ADD COLUMN "name" TEXT;

ALTER TABLE "RatePlan"
	ADD COLUMN "description" TEXT;

UPDATE "RatePlan"
SET
	"name" = COALESCE(
		(SELECT "name" FROM "RatePlanTemplate" WHERE "RatePlanTemplate"."id" = "RatePlan"."templateId"),
		"RatePlan"."id"
	),
	"description" = (
		SELECT "description" FROM "RatePlanTemplate" WHERE "RatePlanTemplate"."id" = "RatePlan"."templateId"
	);

CREATE TABLE IF NOT EXISTS "RatePlan_new" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"variantId" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"description" TEXT,
	"isDefault" INTEGER NOT NULL DEFAULT 0,
	"isActive" INTEGER NOT NULL DEFAULT 1,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("variantId") REFERENCES "Variant" ("id")
);

INSERT INTO "RatePlan_new" (
	"id",
	"variantId",
	"name",
	"description",
	"isDefault",
	"isActive",
	"createdAt"
)
SELECT
	"id",
	"variantId",
	COALESCE("name", "id"),
	"description",
	"isDefault",
	"isActive",
	"createdAt"
FROM "RatePlan";

DROP TABLE "RatePlan";
ALTER TABLE "RatePlan_new" RENAME TO "RatePlan";
DROP TABLE IF EXISTS "RatePlanTemplate";
