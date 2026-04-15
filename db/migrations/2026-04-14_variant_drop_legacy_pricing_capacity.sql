BEGIN TRANSACTION;
PRAGMA foreign_keys = OFF;

CREATE TABLE "__Variant_new" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"productId" TEXT NOT NULL REFERENCES "Product" ("id"),
	"entityType" TEXT NOT NULL,
	"entityId" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"description" TEXT,
	"kind" TEXT,
	"status" TEXT,
	"createdAt" NUMERIC,
	"confirmationType" TEXT NOT NULL DEFAULT 'instant',
	"externalCode" TEXT,
	"isActive" INTEGER NOT NULL DEFAULT 1
);

INSERT INTO "__Variant_new" (
	"id",
	"productId",
	"entityType",
	"entityId",
	"name",
	"description",
	"kind",
	"status",
	"createdAt",
	"confirmationType",
	"externalCode",
	"isActive"
)
SELECT
	"id",
	"productId",
	"entityType",
	"entityId",
	"name",
	"description",
	"kind",
	"status",
	"createdAt",
	"confirmationType",
	"externalCode",
	"isActive"
FROM "Variant";

DROP TABLE "Variant";
ALTER TABLE "__Variant_new" RENAME TO "Variant";

CREATE INDEX IF NOT EXISTS "Variant_entityId_entityType_idx"
ON "Variant" ("entityId", "entityType");

PRAGMA foreign_keys = ON;
COMMIT;
