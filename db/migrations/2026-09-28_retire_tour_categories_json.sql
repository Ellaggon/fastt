-- ProductCategoryLink is the only canonical taxonomy relation for tours.
-- Preserve every meaningful legacy label before dropping Tour.categoriesJson:
-- known categories remain unchanged; unknown labels become inactive categories
-- so they retain traceability without becoming public discovery facets.

DO $$
BEGIN

IF EXISTS (
	SELECT 1
	FROM "Tour"
	WHERE "categoriesJson" IS NOT NULL
		AND jsonb_typeof("categoriesJson") <> 'array'
) THEN
	RAISE EXCEPTION 'TOUR_CATEGORIES_JSON_INVALID_SHAPE';
END IF;

END $$;

CREATE TEMP TABLE "_TourCategoryRetirementSource" ON COMMIT DROP AS
WITH values AS (
	SELECT
		t."productId",
		trim(both FROM CASE
			WHEN jsonb_typeof(element) = 'string' THEN element #>> '{}'
			WHEN jsonb_typeof(element) = 'object' THEN coalesce(element->>'name', element->>'label', element->>'slug', '')
			ELSE ''
		END) AS "rawLabel"
	FROM "Tour" t
	CROSS JOIN LATERAL jsonb_array_elements(coalesce(t."categoriesJson", '[]'::jsonb)) element
), normalized AS (
	SELECT
		"productId",
		"rawLabel",
		trim(both '-' FROM regexp_replace(
			translate(lower("rawLabel"), 'áéíóúüñ', 'aeiouun'),
			'[^a-z0-9]+', '-', 'g'
		)) AS slug
	FROM values
	WHERE "rawLabel" <> ''
)
SELECT DISTINCT "productId", "rawLabel", slug
FROM normalized
WHERE slug <> '';

-- Keep unmatched historic labels safely contained until taxonomy review.
INSERT INTO "ProductCategory" (
	"id", "slug", "name", "vertical", "sortOrder", "isActive", "dataClass", "createdAt"
)
SELECT
	md5('tour:legacy-category:' || source.slug),
	source.slug,
	min(source."rawLabel"),
	'tour',
	0,
	false,
	'production',
	now()
FROM "_TourCategoryRetirementSource" source
LEFT JOIN "ProductCategory" category
	ON category."vertical" = 'tour' AND category.slug = source.slug
WHERE category.id IS NULL
GROUP BY source.slug
ON CONFLICT ("vertical", "slug") DO NOTHING;

INSERT INTO "ProductCategoryLink" ("id", "productId", "categoryId", "createdAt")
SELECT
	md5(source."productId" || ':' || category.id),
	source."productId",
	category.id,
	now()
FROM "_TourCategoryRetirementSource" source
INNER JOIN "ProductCategory" category
	ON category."vertical" = 'tour' AND category.slug = source.slug
ON CONFLICT ("productId", "categoryId") DO NOTHING;

DO $$
BEGIN

IF EXISTS (
	SELECT 1
	FROM "_TourCategoryRetirementSource" source
	WHERE NOT EXISTS (
		SELECT 1
		FROM "ProductCategoryLink" link
		INNER JOIN "ProductCategory" category
			ON category.id = link."categoryId"
		WHERE link."productId" = source."productId"
			AND category."vertical" = 'tour'
			AND category.slug = source.slug
	)
) THEN
	RAISE EXCEPTION 'TOUR_CATEGORY_BACKFILL_INCOMPLETE';
END IF;

END $$;

ALTER TABLE "Tour" DROP COLUMN "categoriesJson";
