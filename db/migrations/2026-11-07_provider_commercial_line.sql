-- Account-level commercial lines. Existing products enroll the line once.
-- Deleting a product clears originProductId and keeps the enrollment.
CREATE TABLE IF NOT EXISTS "ProviderCommercialLine" (
  "id" text PRIMARY KEY,
  "providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE CASCADE,
  "line" text NOT NULL,
  "source" text NOT NULL,
  "originProductId" text REFERENCES "Product"("id") ON DELETE SET NULL,
  "enrolledByUserId" text REFERENCES "User"("id") ON DELETE SET NULL,
  "enrolledAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ProviderCommercialLine_line_check" CHECK ("line" IN ('lodging', 'tour')),
  CONSTRAINT "ProviderCommercialLine_source_check" CHECK ("source" IN ('onboarding', 'product', 'admin'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderCommercialLine_provider_line_unique"
  ON "ProviderCommercialLine" ("providerId", "line");
CREATE INDEX IF NOT EXISTS "ProviderCommercialLine_provider_idx"
  ON "ProviderCommercialLine" ("providerId");

INSERT INTO "ProviderCommercialLine" (
  "id", "providerId", "line", "source", "originProductId", "enrolledAt"
)
SELECT
  md5(product."providerId" || ':lodging'),
  product."providerId",
  'lodging',
  'product',
  (
    SELECT earliest.id
    FROM "Product" earliest
    WHERE earliest."providerId" = product."providerId"
      AND lower(earliest."productType") IN ('hotel', 'whole_home', 'rental')
    ORDER BY earliest."creationDate" ASC
    LIMIT 1
  ),
  now()
FROM (
  SELECT DISTINCT "providerId"
  FROM "Product"
  WHERE lower("productType") IN ('hotel', 'whole_home', 'rental')
    AND "providerId" IS NOT NULL
) product
ON CONFLICT ("providerId", "line") DO NOTHING;

INSERT INTO "ProviderCommercialLine" (
  "id", "providerId", "line", "source", "originProductId", "enrolledAt"
)
SELECT
  md5(product."providerId" || ':tour'),
  product."providerId",
  'tour',
  'product',
  (
    SELECT earliest.id
    FROM "Product" earliest
    WHERE earliest."providerId" = product."providerId"
      AND lower(earliest."productType") = 'tour'
    ORDER BY earliest."creationDate" ASC
    LIMIT 1
  ),
  now()
FROM (
  SELECT DISTINCT "providerId"
  FROM "Product"
  WHERE lower("productType") = 'tour'
    AND "providerId" IS NOT NULL
) product
ON CONFLICT ("providerId", "line") DO NOTHING;
