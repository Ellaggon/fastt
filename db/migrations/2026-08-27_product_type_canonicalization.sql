-- Product types are a domain contract, not presentation copy. Persist only the
-- lowercase vertical key; labels are resolved by the product vertical registry.

BEGIN;

INSERT INTO "MarketplaceCatalogSanitationAudit" (
	"id", "resourceType", "resourceId", "reason", "detailJson"
)
SELECT
	md5('product:type_canonicalized:' || id),
	'Product',
	id,
	'product_type_canonicalized',
	jsonb_build_object('previousProductType', "productType", 'canonicalProductType', lower(trim("productType")))
FROM "Product"
WHERE lower(trim(coalesce("productType", ''))) IN ('hotel', 'tour', 'package', 'limousine')
	AND "productType" IS DISTINCT FROM lower(trim("productType"))
ON CONFLICT ("resourceType", "resourceId", "reason") DO NOTHING;

UPDATE "Product"
SET "productType" = lower(trim("productType"))
WHERE lower(trim(coalesce("productType", ''))) IN ('hotel', 'tour', 'package', 'limousine')
	AND "productType" IS DISTINCT FROM lower(trim("productType"));

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Product_productType_canonical_check'
	) THEN
		ALTER TABLE "Product" ADD CONSTRAINT "Product_productType_canonical_check"
			CHECK ("productType" IN ('hotel', 'tour', 'package', 'limousine'));
	END IF;
END $$;

COMMIT;
