-- Catalog vertical cleanup, etapa 5.
-- Product remains intact: this migration only normalizes existing values and
-- backfills the canonical location table from legacy Hotel columns.

PRAGMA foreign_keys=OFF;

INSERT INTO "ProductLocation" ("productId", "address", "lat", "lng")
SELECT
  h."productId",
  NULLIF(TRIM(COALESCE(h."address", '')), ''),
  h."latitude",
  h."longitude"
FROM "Hotel" h
LEFT JOIN "ProductLocation" pl ON pl."productId" = h."productId"
WHERE pl."productId" IS NULL
  AND (
    NULLIF(TRIM(COALESCE(h."address", '')), '') IS NOT NULL
    OR h."latitude" IS NOT NULL
    OR h."longitude" IS NOT NULL
  );

UPDATE "ProductLocation"
SET
  "address" = COALESCE(
    NULLIF(TRIM("ProductLocation"."address"), ''),
    (
      SELECT NULLIF(TRIM(COALESCE(h."address", '')), '')
      FROM "Hotel" h
      WHERE h."productId" = "ProductLocation"."productId"
    )
  ),
  "lat" = COALESCE(
    "ProductLocation"."lat",
    (
      SELECT h."latitude"
      FROM "Hotel" h
      WHERE h."productId" = "ProductLocation"."productId"
    )
  ),
  "lng" = COALESCE(
    "ProductLocation"."lng",
    (
      SELECT h."longitude"
      FROM "Hotel" h
      WHERE h."productId" = "ProductLocation"."productId"
    )
  )
WHERE EXISTS (
  SELECT 1
  FROM "Hotel" h
  WHERE h."productId" = "ProductLocation"."productId"
    AND (
      NULLIF(TRIM(COALESCE(h."address", '')), '') IS NOT NULL
      OR h."latitude" IS NOT NULL
      OR h."longitude" IS NOT NULL
    )
);

UPDATE "Product"
SET "productType" = 'Hotel'
WHERE lower(trim("productType")) IN (
  'hotel',
  'hotels',
  'lodging',
  'accommodation',
  'accommodations',
  'alojamiento',
  'alojamientos'
);

UPDATE "Product"
SET "productType" = 'Tour'
WHERE lower(trim("productType")) IN (
  'tour',
  'tours',
  'experience',
  'experiences'
);

UPDATE "Product"
SET "productType" = 'Package'
WHERE lower(trim("productType")) IN (
  'package',
  'packages',
  'paquete',
  'paquetes'
);

PRAGMA foreign_keys=ON;
