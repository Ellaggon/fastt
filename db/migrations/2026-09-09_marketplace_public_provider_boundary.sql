-- Public marketplace visibility belongs to both inventory and provider.
-- Reclassify incompatible legacy records before enforcing the canonical boundary.

UPDATE "Product" product
SET "dataClass" = 'fixture'
FROM "Provider" provider
WHERE provider."id" = product."providerId"
  AND product."dataClass" = 'production'
  AND (provider."accountPurpose" <> 'commercial' OR provider."dataClassification" <> 'production');

UPDATE "ProductContent" content
SET "dataClass" = product."dataClass"
FROM "Product" product
WHERE product."id" = content."productId"
  AND content."dataClass" IS DISTINCT FROM product."dataClass";

UPDATE "ProductStatus" status
SET "state" = 'draft'
FROM "Product" product
WHERE product."id" = status."productId"
  AND product."dataClass" <> 'production'
  AND status."state" = 'published';

UPDATE "Provider"
SET "dataClassification" = 'fixture'
WHERE "accountPurpose" IN ('internal_qa', 'integration_certification')
  AND "dataClassification" = 'production';

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

  IF TG_TABLE_NAME = 'ProductStatus' THEN
    IF NEW."state" <> 'published' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM "Product" product
      INNER JOIN "Provider" provider ON provider."id" = product."providerId"
      WHERE product."id" = NEW."productId"
        AND product."dataClass" = 'production'
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
        INNER JOIN "ProductStatus" status ON status."productId" = product."id"
        WHERE product."providerId" = NEW."id"
          AND product."dataClass" = 'production'
          AND status."state" = 'published'
      ) THEN
      RAISE EXCEPTION 'PROVIDER_HAS_PUBLISHED_PRODUCTION_PRODUCTS';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductContent_publication_boundary" ON "ProductContent";
CREATE TRIGGER "trg_ProductContent_publication_boundary"
BEFORE INSERT OR UPDATE OF "productId", "dataClass" ON "ProductContent"
FOR EACH ROW EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_ProductStatus_publication_boundary" ON "ProductStatus";
CREATE TRIGGER "trg_ProductStatus_publication_boundary"
BEFORE INSERT OR UPDATE OF "state", "productId" ON "ProductStatus"
FOR EACH ROW EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_Provider_publication_boundary" ON "Provider";
CREATE TRIGGER "trg_Provider_publication_boundary"
BEFORE UPDATE OF "accountPurpose", "dataClassification" ON "Provider"
FOR EACH ROW EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();
