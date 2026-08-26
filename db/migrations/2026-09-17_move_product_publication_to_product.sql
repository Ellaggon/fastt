-- Publication is part of the Product aggregate. ProductStatus was a nullable,
-- one-to-one projection that allowed products to exist without a lifecycle state.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "publicationState" text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "publicationValidationErrorsJson" jsonb,
  ADD COLUMN IF NOT EXISTS "publicationUpdatedAt" timestamptz NOT NULL DEFAULT now();

UPDATE "Product" product
SET
  "publicationState" = CASE
    WHEN status."state" IN ('draft', 'ready', 'published') THEN status."state"
    ELSE 'draft'
  END,
  "publicationValidationErrorsJson" = status."validationErrorsJson",
  "publicationUpdatedAt" = COALESCE(product."lastUpdated", now())
FROM "ProductStatus" status
WHERE status."productId" = product."id";

-- Never invent missing Tour records. Preserve the products as drafts and expose
-- the exact blocker to the same readiness surface used by administrators.
UPDATE "Product" product
SET
  "publicationState" = 'draft',
  "publicationValidationErrorsJson" = CASE
    WHEN jsonb_typeof(product."publicationValidationErrorsJson") = 'array'
      THEN product."publicationValidationErrorsJson" || jsonb_build_array(
        jsonb_build_object('code', 'missing_subtype', 'message', 'Subtype details are required')
      )
    ELSE jsonb_build_array(
      jsonb_build_object('code', 'missing_subtype', 'message', 'Subtype details are required')
    )
  END,
  "publicationUpdatedAt" = now()
WHERE lower(product."productType") = 'tour'
  AND NOT EXISTS (
    SELECT 1 FROM "Tour" tour WHERE tour."productId" = product."id"
  );

ALTER TABLE "Product"
  DROP CONSTRAINT IF EXISTS "Product_publicationState_check";

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_publicationState_check"
  CHECK ("publicationState" IN ('draft', 'ready', 'published'));

CREATE INDEX IF NOT EXISTS "Product_provider_publication_idx"
  ON "Product" ("providerId", "publicationState");

CREATE INDEX IF NOT EXISTS "Product_publication_discovery_idx"
  ON "Product" ("publicationState", "dataClass");

CREATE OR REPLACE FUNCTION fastt_enforce_marketplace_publication_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_class text;
BEGIN
  IF TG_TABLE_NAME = 'ProductContent' THEN
    SELECT "dataClass" INTO product_class FROM "Product" WHERE "id" = NEW."productId";
    IF product_class IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_REQUIRES_PRODUCT';
    END IF;
    IF NEW."dataClass" IS DISTINCT FROM product_class THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_DATA_CLASS_MISMATCH';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Product' THEN
    IF NEW."publicationState" <> 'published' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM "Provider" provider
      WHERE provider."id" = NEW."providerId"
        AND NEW."dataClass" = 'production'
        AND provider."accountPurpose" = 'commercial'
        AND provider."dataClassification" = 'production'
    ) THEN
      RAISE EXCEPTION 'PUBLIC_PRODUCT_PROVIDER_NOT_ELIGIBLE';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Provider' THEN
    IF (NEW."accountPurpose" <> 'commercial' OR NEW."dataClassification" <> 'production')
      AND EXISTS (
        SELECT 1
        FROM "Product" product
        WHERE product."providerId" = NEW."id"
          AND product."dataClass" = 'production'
          AND product."publicationState" = 'published'
      ) THEN
      RAISE EXCEPTION 'PROVIDER_HAS_PUBLISHED_PRODUCTION_PRODUCTS';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductStatus_publication_boundary" ON "ProductStatus";
DROP TRIGGER IF EXISTS "trg_Product_publication_boundary" ON "Product";
CREATE TRIGGER "trg_Product_publication_boundary"
BEFORE INSERT OR UPDATE OF "publicationState", "providerId", "dataClass" ON "Product"
FOR EACH ROW EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TABLE "ProductStatus";
