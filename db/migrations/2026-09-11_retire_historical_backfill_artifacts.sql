-- Close the one-off catalog sanitation and category backfill after review.
-- The source migrations and the tracked checksum remain the immutable technical
-- history; no runtime code consumes either evidence table.

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "TourCategoryBackfillUnmapped") THEN
		RAISE EXCEPTION 'TOUR_CATEGORY_BACKFILL_REQUIRES_REVIEW';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "Product"
		WHERE "productType" IS DISTINCT FROM lower("productType")
	) THEN
		RAISE EXCEPTION 'PRODUCT_TYPES_ARE_NOT_CANONICAL';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "MarketplaceCatalogSanitationAudit" audit
		LEFT JOIN "ProductCategory" canonical
			ON canonical."id" = audit."canonicalResourceId"
		WHERE audit."reason" = 'duplicate_name'
			AND (
				audit."canonicalResourceId" IS NULL
				OR canonical."id" IS NULL
				OR canonical."isActive" IS NOT TRUE
				OR canonical."dataClass" <> 'production'
			)
	) THEN
		RAISE EXCEPTION 'DUPLICATE_CATEGORY_CANONICAL_TARGET_INVALID';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "MarketplaceCatalogSanitationAudit" audit
		JOIN "ProductCategory" category ON category."id" = audit."resourceId"
		WHERE audit."resourceType" = 'ProductCategory'
			AND audit."reason" IN ('duplicate_name', 'uuid_slug')
			AND (category."isActive" IS TRUE OR category."dataClass" <> 'fixture')
	) THEN
		RAISE EXCEPTION 'HISTORICAL_CATEGORY_IS_NO_LONGER_SAFE_TO_RETIRE';
	END IF;
END $$;

-- Preserve product classification by moving every duplicate-category link to
-- its reviewed canonical category before removing the obsolete source link.
INSERT INTO "ProductCategoryLink" ("id", "productId", "categoryId", "createdAt")
SELECT
	md5(link."productId" || ':' || audit."canonicalResourceId"),
	link."productId",
	audit."canonicalResourceId",
	now()
FROM "MarketplaceCatalogSanitationAudit" audit
INNER JOIN "ProductCategoryLink" link ON link."categoryId" = audit."resourceId"
WHERE audit."resourceType" = 'ProductCategory'
	AND audit."reason" = 'duplicate_name'
	AND audit."canonicalResourceId" IS NOT NULL
ON CONFLICT ("productId", "categoryId") DO NOTHING;

DELETE FROM "ProductCategoryLink" link
USING "MarketplaceCatalogSanitationAudit" audit
WHERE link."categoryId" = audit."resourceId"
	AND audit."resourceType" = 'ProductCategory'
	AND audit."reason" IN ('duplicate_name', 'uuid_slug');

DELETE FROM "ProductCategory" category
USING "MarketplaceCatalogSanitationAudit" audit
WHERE category."id" = audit."resourceId"
	AND audit."resourceType" = 'ProductCategory'
	AND audit."reason" IN ('duplicate_name', 'uuid_slug');

DROP TABLE "MarketplaceCatalogSanitationAudit";
DROP TABLE "TourCategoryBackfillUnmapped";
