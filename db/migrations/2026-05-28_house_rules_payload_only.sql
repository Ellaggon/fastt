-- HouseRule payload-only cleanup.
-- Guest-facing rule copy is derived from payloadJson, avoiding a second text source.

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "HouseRule_new" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

INSERT INTO "HouseRule_new" ("id", "productId", "type", "payloadJson", "createdAt")
SELECT
  "id",
  "productId",
  "type",
  COALESCE("payloadJson", json_object('kind', COALESCE("type", 'Other'))),
  "createdAt"
FROM "HouseRule";

DROP TABLE "HouseRule";
ALTER TABLE "HouseRule_new" RENAME TO "HouseRule";

CREATE INDEX IF NOT EXISTS "HouseRule_productId_type_idx"
ON "HouseRule" ("productId", "type");

PRAGMA foreign_keys=ON;
