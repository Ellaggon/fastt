-- Fase 3B: HouseRule is the only canonical guest-facing rules source.
-- ProductContent keeps editorial listing copy only: description, highlights and SEO.

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "ProductContent_new" (
  "productId" TEXT PRIMARY KEY,
  "description" TEXT,
  "highlightsJson" JSON,
  "seoJson" JSON,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

INSERT INTO "ProductContent_new" ("productId", "description", "highlightsJson", "seoJson")
SELECT "productId", "description", "highlightsJson", "seoJson"
FROM "ProductContent";

DROP TABLE "ProductContent";
ALTER TABLE "ProductContent_new" RENAME TO "ProductContent";

CREATE TABLE IF NOT EXISTS "HouseRule_new" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

INSERT INTO "HouseRule_new" ("id", "productId", "type", "description", "payloadJson", "createdAt")
SELECT
  "id",
  "productId",
  "type",
  "description",
  COALESCE("payloadJson", json_object('kind', COALESCE("type", 'Other'))),
  "createdAt"
FROM "HouseRule";

DROP TABLE "HouseRule";
ALTER TABLE "HouseRule_new" RENAME TO "HouseRule";

CREATE INDEX IF NOT EXISTS "HouseRule_productId_type_idx"
ON "HouseRule" ("productId", "type");

PRAGMA foreign_keys=ON;
