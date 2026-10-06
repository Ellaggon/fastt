-- G7: commission snapshots reference the accepted commercial line and agreement version.
ALTER TABLE "CommissionSnapshot"
  ADD COLUMN IF NOT EXISTS "commercialLine" text,
  ADD COLUMN IF NOT EXISTS "agreementVersion" text;

ALTER TABLE "CommissionSnapshot"
  DROP CONSTRAINT IF EXISTS "CommissionSnapshot_commercialLine_check";

ALTER TABLE "CommissionSnapshot"
  ADD CONSTRAINT "CommissionSnapshot_commercialLine_check"
  CHECK ("commercialLine" IS NULL OR "commercialLine" IN ('lodging', 'tour'));

CREATE INDEX IF NOT EXISTS "CommissionSnapshot_provider_line_idx"
  ON "CommissionSnapshot" ("providerId", "commercialLine");

-- Backfill legacy snapshots from the immutable line item product snapshot. Only the product
-- referenced by "productIdSnapshot" (or, as fallback, via the live variant) defines the line;
-- a snapshot whose line cannot be derived stays NULL and is reported as undeclared.
WITH booking_line AS (
  SELECT
    bli."bookingId",
    CASE
      WHEN lower(coalesce(sp."productType", vp."productType")) = 'tour' THEN 'tour'
      WHEN lower(coalesce(sp."productType", vp."productType")) IN ('hotel', 'rental', 'whole_home', 'lodging') THEN 'lodging'
      ELSE NULL
    END AS line
  FROM "BookingLineItem" bli
  LEFT JOIN "Product" sp ON sp."id" = bli."productIdSnapshot"
  LEFT JOIN "Variant" v ON v."id" = bli."variantId"
  LEFT JOIN "Product" vp ON vp."id" = v."productId"
),
booking_single_line AS (
  SELECT "bookingId", min(line) AS line
  FROM booking_line
  WHERE line IS NOT NULL
  GROUP BY "bookingId"
  HAVING count(DISTINCT line) = 1
)
UPDATE "CommissionSnapshot" cs
SET "commercialLine" = bsl.line
FROM booking_single_line bsl
WHERE cs."bookingId" = bsl."bookingId"
  AND cs."commercialLine" IS NULL;

-- The agreement version is only declared when the provider has enrolled that line.
UPDATE "CommissionSnapshot" cs
SET "agreementVersion" = cs."commercialLine" || ':v1'
FROM "ProviderCommercialLine" pcl
WHERE cs."agreementVersion" IS NULL
  AND cs."commercialLine" IS NOT NULL
  AND pcl."providerId" = cs."providerId"
  AND pcl."line" = cs."commercialLine";

UPDATE "CommissionSnapshot"
SET "agreementVersion" = 'undeclared'
WHERE "agreementVersion" IS NULL;
