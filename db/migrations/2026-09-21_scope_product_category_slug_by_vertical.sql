-- Category slugs are editorial identifiers within a vertical, not global IDs.
-- Verify existing data before narrowing the unique namespace.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "ProductCategory"
		WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
			OR vertical !~ '^[a-z][a-z0-9_]*$'
	) THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_IDENTIFIERS_ARE_NOT_NORMALIZED';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "ProductCategory"
		GROUP BY vertical, slug
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_VERTICAL_SLUG_DUPLICATES_EXIST';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "ProductCategoryLink" link
		JOIN "Product" product ON product.id = link."productId"
		JOIN "ProductCategory" category ON category.id = link."categoryId"
		WHERE lower(product."productType") <> lower(category.vertical)
	) THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_CROSS_VERTICAL_LINKS_EXIST';
	END IF;
END;
$$;

DROP INDEX IF EXISTS "ProductCategory_slug_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_vertical_slug_unique"
	ON "ProductCategory" (vertical, slug);

ALTER TABLE "ProductCategory"
	DROP CONSTRAINT IF EXISTS "ProductCategory_slug_format_check",
	ADD CONSTRAINT "ProductCategory_slug_format_check"
		CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	DROP CONSTRAINT IF EXISTS "ProductCategory_vertical_format_check",
	ADD CONSTRAINT "ProductCategory_vertical_format_check"
		CHECK (vertical ~ '^[a-z][a-z0-9_]*$');

CREATE OR REPLACE FUNCTION fastt_validate_product_category_vertical()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	product_vertical text;
	category_vertical text;
BEGIN
	SELECT lower(trim(product."productType")), lower(trim(category.vertical))
	INTO product_vertical, category_vertical
	FROM "Product" product
	JOIN "ProductCategory" category ON category.id = NEW."categoryId"
	WHERE product.id = NEW."productId";

	IF product_vertical IS NULL OR category_vertical IS NULL THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_LINK_REFERENCES_MISSING_RESOURCE';
	END IF;

	IF product_vertical <> category_vertical THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_VERTICAL_MISMATCH: product %, category %',
			product_vertical, category_vertical;
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductCategoryLink_vertical_match" ON "ProductCategoryLink";
CREATE TRIGGER "trg_ProductCategoryLink_vertical_match"
BEFORE INSERT OR UPDATE OF "productId", "categoryId" ON "ProductCategoryLink"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_product_category_vertical();
