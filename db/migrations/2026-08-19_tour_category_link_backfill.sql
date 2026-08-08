-- Canonicalize tour discovery categories onto ProductCategoryLink.
-- Backfill from legacy Tour.categoriesJson; log unmapped labels for review.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING + TEMP materialization).

CREATE TABLE IF NOT EXISTS "TourCategoryBackfillUnmapped" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product"("id"),
	"rawLabel" text NOT NULL,
	"normalized" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "TourCategoryBackfillUnmapped_productId_idx"
	ON "TourCategoryBackfillUnmapped" ("productId");
CREATE INDEX IF NOT EXISTS "TourCategoryBackfillUnmapped_normalized_idx"
	ON "TourCategoryBackfillUnmapped" ("normalized");

-- Materialize mapped rows once so both INSERTs share the same CTE result.
-- (A WITH clause only scopes a single statement; TEMP avoids repeating a large CTE.)
DROP TABLE IF EXISTS "_TourCategoryBackfillMapped";
CREATE TEMP TABLE "_TourCategoryBackfillMapped" ON COMMIT DROP AS
WITH exploded AS (
	SELECT
		t."productId",
		CASE
			WHEN jsonb_typeof(elem) = 'string' THEN trim(both FROM elem #>> '{}')
			WHEN jsonb_typeof(elem) = 'object' THEN trim(both FROM coalesce(elem->>'name', elem->>'label', elem->>'slug', ''))
			ELSE ''
		END AS "rawLabel"
	FROM "Tour" t
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof(t."categoriesJson") = 'array' THEN t."categoriesJson"
			ELSE '[]'::jsonb
		END
	) AS elem
	WHERE t."categoriesJson" IS NOT NULL
),
normalized AS (
	SELECT
		"productId",
		"rawLabel",
		trim(both '-' FROM regexp_replace(lower(trim(both FROM "rawLabel")), '[^a-z0-9]+', '-', 'g')) AS "slug"
	FROM exploded
	WHERE coalesce(trim(both FROM "rawLabel"), '') <> ''
)
SELECT
	n."productId",
	n."rawLabel",
	n."slug",
	c."id" AS "categoryId"
FROM normalized n
LEFT JOIN "ProductCategory" c
	ON c."vertical" = 'tour'
	AND (
		c."slug" = n."slug"
		OR lower(c."name") = lower(n."rawLabel")
		-- Common aliases from free-text provider tags
		OR (n."slug" IN ('city', 'citytour', 'city-tours') AND c."slug" = 'city-tour')
		OR (n."slug" IN ('trek', 'hiking', 'senderismo') AND c."slug" = 'trekking')
		OR (n."slug" IN ('food', 'foodie', 'culinaria', 'culinary') AND c."slug" = 'gastronomy')
		OR (n."slug" IN ('agua', 'water', 'kayak', 'rafting') AND c."slug" = 'water-activities')
		OR (n."slug" IN ('naturaleza', 'nature', 'fauna') AND c."slug" = 'wildlife')
		OR (n."slug" IN ('aventura', 'extreme') AND c."slug" = 'adventure')
		OR (n."slug" IN ('cultura', 'heritage') AND c."slug" = 'cultural')
	);

-- Insert known links (idempotent)
INSERT INTO "ProductCategoryLink" ("id", "productId", "categoryId", "createdAt")
SELECT
	md5(m."productId" || ':' || m."categoryId"),
	m."productId",
	m."categoryId",
	now()
FROM "_TourCategoryBackfillMapped" m
WHERE m."categoryId" IS NOT NULL
ON CONFLICT ("productId", "categoryId") DO NOTHING;

-- Register unmapped labels for ops review (idempotent by product+normalized)
INSERT INTO "TourCategoryBackfillUnmapped" ("id", "productId", "rawLabel", "normalized", "createdAt")
SELECT
	md5(m."productId" || ':unmapped:' || m."slug"),
	m."productId",
	m."rawLabel",
	m."slug",
	now()
FROM "_TourCategoryBackfillMapped" m
WHERE m."categoryId" IS NULL
ON CONFLICT ("id") DO NOTHING;
