-- The old polymorphic shape cannot prove ownership. Refuse the cutover rather
-- than silently orphaning an asset or attaching it to a guessed catalog record.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "Image"
		WHERE lower(coalesce("entityType", '')) NOT IN ('product', 'variant')
	) THEN
		RAISE EXCEPTION 'IMAGE_OWNERSHIP_MIGRATION_HAS_NON_CATALOG_ASSETS';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "Image" image
		WHERE lower(image."entityType") = 'product'
			AND NOT EXISTS (SELECT 1 FROM "Product" product WHERE product.id = image."entityId")
	) THEN
		RAISE EXCEPTION 'IMAGE_OWNERSHIP_MIGRATION_HAS_MISSING_PRODUCT';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "Image" image
		WHERE lower(image."entityType") = 'variant'
			AND NOT EXISTS (SELECT 1 FROM "Variant" variant WHERE variant.id = image."entityId")
	) THEN
		RAISE EXCEPTION 'IMAGE_OWNERSHIP_MIGRATION_HAS_MISSING_VARIANT';
	END IF;
END;
$$;

CREATE TABLE "ProductImage" (
	"productId" text NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
	"imageId" text NOT NULL REFERENCES "Image"("id") ON DELETE CASCADE,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isPrimary" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "ProductImage_product_image_pk" PRIMARY KEY ("productId", "imageId"),
	CONSTRAINT "ProductImage_sortOrder_nonnegative" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "VariantImage" (
	"variantId" text NOT NULL REFERENCES "Variant"("id") ON DELETE CASCADE,
	"imageId" text NOT NULL REFERENCES "Image"("id") ON DELETE CASCADE,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isPrimary" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "VariantImage_variant_image_pk" PRIMARY KEY ("variantId", "imageId"),
	CONSTRAINT "VariantImage_sortOrder_nonnegative" CHECK ("sortOrder" >= 0)
);

-- Multiple legacy primary flags are normalized deterministically: the former
-- primary with the earliest order wins, otherwise the first gallery item wins.
INSERT INTO "ProductImage" ("productId", "imageId", "sortOrder", "isPrimary")
SELECT
	image."entityId",
	image.id,
	GREATEST(0, COALESCE(image."order", 0)),
	ROW_NUMBER() OVER (
		PARTITION BY image."entityId"
		ORDER BY image."isPrimary" DESC, image."order" ASC, image.id ASC
	) = 1
FROM "Image" image
WHERE lower(image."entityType") = 'product';

INSERT INTO "VariantImage" ("variantId", "imageId", "sortOrder", "isPrimary")
SELECT
	image."entityId",
	image.id,
	GREATEST(0, COALESCE(image."order", 0)),
	ROW_NUMBER() OVER (
		PARTITION BY image."entityId"
		ORDER BY image."isPrimary" DESC, image."order" ASC, image.id ASC
	) = 1
FROM "Image" image
WHERE lower(image."entityType") = 'variant';

CREATE UNIQUE INDEX "ProductImage_imageId_unique" ON "ProductImage" ("imageId");
CREATE UNIQUE INDEX "ProductImage_one_primary_product_unique"
	ON "ProductImage" ("productId") WHERE "isPrimary" = true;
CREATE INDEX "ProductImage_product_sort_idx"
	ON "ProductImage" ("productId", "sortOrder", "imageId");

CREATE UNIQUE INDEX "VariantImage_imageId_unique" ON "VariantImage" ("imageId");
CREATE UNIQUE INDEX "VariantImage_one_primary_variant_unique"
	ON "VariantImage" ("variantId") WHERE "isPrimary" = true;
CREATE INDEX "VariantImage_variant_sort_idx"
	ON "VariantImage" ("variantId", "sortOrder", "imageId");

CREATE OR REPLACE FUNCTION fastt_prevent_catalog_image_owner_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_TABLE_NAME = 'ProductImage' AND EXISTS (
		SELECT 1 FROM "VariantImage" WHERE "imageId" = NEW."imageId"
	) THEN
		RAISE EXCEPTION 'CATALOG_IMAGE_ALREADY_LINKED_TO_VARIANT';
	END IF;
	IF TG_TABLE_NAME = 'VariantImage' AND EXISTS (
		SELECT 1 FROM "ProductImage" WHERE "imageId" = NEW."imageId"
	) THEN
		RAISE EXCEPTION 'CATALOG_IMAGE_ALREADY_LINKED_TO_PRODUCT';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_ProductImage_single_catalog_owner"
BEFORE INSERT OR UPDATE OF "imageId" ON "ProductImage"
FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_image_owner_overlap();

CREATE TRIGGER "trg_VariantImage_single_catalog_owner"
BEFORE INSERT OR UPDATE OF "imageId" ON "VariantImage"
FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_image_owner_overlap();

ALTER TABLE "ImageUpload" DROP CONSTRAINT IF EXISTS "ImageUpload_imageId_fk";
ALTER TABLE "ImageUpload"
	ADD CONSTRAINT "ImageUpload_imageId_fk"
	FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "Image_entityType_entityId_idx";
DROP INDEX IF EXISTS "Image_entityId_idx";
ALTER TABLE "Image"
	DROP COLUMN "entityType",
	DROP COLUMN "entityId",
	DROP COLUMN "order",
	DROP COLUMN "isPrimary";
