-- Canonical commercial aggregates always belong to a provider. Ownership is
-- immutable after creation, so nullable ownership would only create unusable
-- rows that can never be repaired through normal commands.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "Product" WHERE "providerId" IS NULL) THEN
		RAISE EXCEPTION 'PRODUCT_PROVIDER_REQUIRED_PRECHECK_FAILED';
	END IF;
	IF EXISTS (SELECT 1 FROM "TaxFeeDefinition" WHERE "providerId" IS NULL) THEN
		RAISE EXCEPTION 'TAX_FEE_DEFINITION_PROVIDER_REQUIRED_PRECHECK_FAILED';
	END IF;
END;
$$;

ALTER TABLE "Product" ALTER COLUMN "providerId" SET NOT NULL;
ALTER TABLE "TaxFeeDefinition" ALTER COLUMN "providerId" SET NOT NULL;
