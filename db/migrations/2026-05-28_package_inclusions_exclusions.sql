-- Package inclusions/exclusions hardening.
-- Package no longer borrows ProductContent.highlightsJson as operational
-- inclusions. Highlights stay editorial; Package owns traveler-facing
-- includes/excludes.

ALTER TABLE "Package" ADD COLUMN "includes" TEXT;
ALTER TABLE "Package" ADD COLUMN "excludes" TEXT;

UPDATE "Package"
SET "includes" = (
  SELECT
    CASE
      WHEN json_valid(pc."highlightsJson") = 1
        AND json_type(pc."highlightsJson") = 'array'
        AND json_array_length(pc."highlightsJson") > 0
      THEN (
        SELECT group_concat(value, char(10))
        FROM json_each(pc."highlightsJson")
        WHERE TRIM(COALESCE(value, '')) <> ''
      )
      ELSE NULL
    END
  FROM "ProductContent" pc
  WHERE pc."productId" = "Package"."productId"
)
WHERE NULLIF(TRIM(COALESCE("includes", '')), '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM "ProductContent" pc
    WHERE pc."productId" = "Package"."productId"
      AND json_valid(pc."highlightsJson") = 1
      AND json_type(pc."highlightsJson") = 'array'
      AND json_array_length(pc."highlightsJson") > 0
  );
