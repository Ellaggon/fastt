-- Marketplace data isolation and non-destructive taxonomy sanitation.
--
-- `dataClass` is provenance, not publication state: a production record may
-- still be unpublished, while demo/fixture/sandbox records must never be read
-- by anonymous marketplace surfaces. Existing rows remain production until an
-- operator classifies them; known malformed categories are safely deactivated.

BEGIN;

ALTER TABLE "Product"
	ADD COLUMN IF NOT EXISTS "dataClass" text NOT NULL DEFAULT 'production';
ALTER TABLE "ProductCategory"
	ADD COLUMN IF NOT EXISTS "dataClass" text NOT NULL DEFAULT 'production';
ALTER TABLE "ProductContent"
	ADD COLUMN IF NOT EXISTS "dataClass" text NOT NULL DEFAULT 'production';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Product_dataClass_check'
	) THEN
		ALTER TABLE "Product" ADD CONSTRAINT "Product_dataClass_check"
			CHECK ("dataClass" IN ('production', 'demo', 'fixture', 'sandbox'));
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ProductCategory_dataClass_check'
	) THEN
		ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_dataClass_check"
			CHECK ("dataClass" IN ('production', 'demo', 'fixture', 'sandbox'));
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ProductContent_dataClass_check'
	) THEN
		ALTER TABLE "ProductContent" ADD CONSTRAINT "ProductContent_dataClass_check"
			CHECK ("dataClass" IN ('production', 'demo', 'fixture', 'sandbox'));
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Product_dataClass_productType_idx"
	ON "Product" ("dataClass", "productType");
CREATE INDEX IF NOT EXISTS "ProductCategory_public_taxonomy_idx"
	ON "ProductCategory" ("vertical", "dataClass", "isActive", "sortOrder", "name");
CREATE INDEX IF NOT EXISTS "ProductContent_dataClass_idx"
	ON "ProductContent" ("dataClass");

-- Content inherits existing product provenance at migration time. Future writes
-- must persist the same class explicitly in the catalog repository.
UPDATE "ProductContent" content
SET "dataClass" = product."dataClass"
FROM "Product" product
WHERE product.id = content."productId"
	AND content."dataClass" IS DISTINCT FROM product."dataClass";

CREATE TABLE IF NOT EXISTS "MarketplaceCatalogSanitationAudit" (
	"id" text PRIMARY KEY,
	"resourceType" text NOT NULL,
	"resourceId" text NOT NULL,
	"reason" text NOT NULL,
	"canonicalResourceId" text NULL,
	"detailJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	UNIQUE ("resourceType", "resourceId", "reason")
);
CREATE INDEX IF NOT EXISTS "MarketplaceCatalogSanitationAudit_reason_created_idx"
	ON "MarketplaceCatalogSanitationAudit" ("reason", "createdAt" DESC);

-- UUID-bearing slugs are fixture artifacts, not a controlled public taxonomy.
-- Preserve the row and its links for investigation, but make it impossible for
-- anonymous discovery to display it.
WITH malformed AS (
	SELECT id, slug, name, vertical
	FROM "ProductCategory"
	WHERE lower(coalesce(slug, '')) ~ '(^|-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}($|-)'
)
INSERT INTO "MarketplaceCatalogSanitationAudit" (
	"id", "resourceType", "resourceId", "reason", "detailJson"
)
SELECT
	md5('category:uuid_slug:' || id),
	'ProductCategory',
	id,
	'uuid_slug',
	jsonb_build_object('slug', slug, 'name', name, 'vertical', vertical)
FROM malformed
ON CONFLICT ("resourceType", "resourceId", "reason") DO NOTHING;

UPDATE "ProductCategory"
SET "isActive" = false,
	"dataClass" = 'fixture'
WHERE lower(coalesce(slug, '')) ~ '(^|-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}($|-)';

-- Merge only exact duplicate display names inside the same vertical. Links are
-- copied first, then the duplicate is deactivated. No category or evidence is
-- deleted, and a canonical category is selected deterministically.
WITH ranked AS (
	SELECT
		id,
		first_value(id) OVER duplicate_group AS canonical_id,
		row_number() OVER duplicate_group AS position,
		name,
		vertical
	FROM "ProductCategory"
	WINDOW duplicate_group AS (
		PARTITION BY lower(trim(name)), vertical
		ORDER BY
			CASE WHEN "isActive" THEN 0 ELSE 1 END,
			CASE "dataClass" WHEN 'production' THEN 0 WHEN 'demo' THEN 1 WHEN 'sandbox' THEN 2 ELSE 3 END,
			"sortOrder", "createdAt", id
	)
), duplicates AS (
	SELECT id, canonical_id, name, vertical
	FROM ranked
	WHERE position > 1 AND id <> canonical_id
)
INSERT INTO "MarketplaceCatalogSanitationAudit" (
	"id", "resourceType", "resourceId", "reason", "canonicalResourceId", "detailJson"
)
SELECT
	md5('category:duplicate_name:' || id),
	'ProductCategory',
	id,
	'duplicate_name',
	canonical_id,
	jsonb_build_object('name', name, 'vertical', vertical)
FROM duplicates
ON CONFLICT ("resourceType", "resourceId", "reason") DO NOTHING;

WITH ranked AS (
	SELECT
		id,
		first_value(id) OVER duplicate_group AS canonical_id,
		row_number() OVER duplicate_group AS position
	FROM "ProductCategory"
	WINDOW duplicate_group AS (
		PARTITION BY lower(trim(name)), vertical
		ORDER BY
			CASE WHEN "isActive" THEN 0 ELSE 1 END,
			CASE "dataClass" WHEN 'production' THEN 0 WHEN 'demo' THEN 1 WHEN 'sandbox' THEN 2 ELSE 3 END,
			"sortOrder", "createdAt", id
	)
), duplicates AS (
	SELECT id, canonical_id FROM ranked WHERE position > 1 AND id <> canonical_id
)
INSERT INTO "ProductCategoryLink" ("id", "productId", "categoryId", "createdAt")
SELECT
	md5(link."productId" || ':' || duplicate.canonical_id),
	link."productId",
	duplicate.canonical_id,
	now()
FROM "ProductCategoryLink" link
INNER JOIN duplicates duplicate ON duplicate.id = link."categoryId"
ON CONFLICT ("productId", "categoryId") DO NOTHING;

WITH ranked AS (
	SELECT
		id,
		row_number() OVER (
			PARTITION BY lower(trim(name)), vertical
			ORDER BY
				CASE WHEN "isActive" THEN 0 ELSE 1 END,
				CASE "dataClass" WHEN 'production' THEN 0 WHEN 'demo' THEN 1 WHEN 'sandbox' THEN 2 ELSE 3 END,
				"sortOrder", "createdAt", id
		) AS position
	FROM "ProductCategory"
)
UPDATE "ProductCategory" category
SET "isActive" = false
FROM ranked
WHERE category.id = ranked.id
	AND ranked.position > 1;

COMMIT;
