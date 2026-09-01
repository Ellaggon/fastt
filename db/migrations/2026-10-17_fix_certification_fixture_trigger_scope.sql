-- The original certification integrity trigger was shared by Provider,
-- Product and ProviderIntegrationCertification. PostgreSQL compiles NEW as
-- the current table's row type, so each table needs its own typed function.
CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_certification_fixture()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "Provider" WHERE "id" = NEW."providerId" AND "accountPurpose" = 'integration_certification') THEN
		RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_INVALID';
	END IF;
	IF NEW."fixtureProductId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "Product"
		WHERE "id" = NEW."fixtureProductId" AND "providerId" = NEW."providerId" AND "dataClass" = 'fixture'
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_INVALID'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_certification_fixture_product_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "ProviderIntegrationCertification"
		WHERE "fixtureProductId" = NEW."id"
			AND ("providerId" IS DISTINCT FROM NEW."providerId" OR NEW."dataClass" <> 'fixture')
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_DRIFT'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_certification_provider_purpose_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."accountPurpose" <> 'integration_certification' AND EXISTS (
		SELECT 1 FROM "ProviderIntegrationCertification" WHERE "providerId" = NEW."id"
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_PURPOSE_DRIFT'; END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationCertification_fixture" ON "ProviderIntegrationCertification";
CREATE TRIGGER "trg_ProviderIntegrationCertification_fixture"
BEFORE INSERT OR UPDATE OF "providerId", "fixtureProductId" ON "ProviderIntegrationCertification"
FOR EACH ROW EXECUTE FUNCTION fastt_validate_provider_integration_certification_fixture();

DROP TRIGGER IF EXISTS "trg_Product_certification_fixture_drift" ON "Product";
CREATE TRIGGER "trg_Product_certification_fixture_drift"
BEFORE UPDATE OF "providerId", "dataClass" ON "Product"
FOR EACH ROW EXECUTE FUNCTION fastt_prevent_certification_fixture_product_drift();

DROP TRIGGER IF EXISTS "trg_Provider_certification_fixture_drift" ON "Provider";
CREATE TRIGGER "trg_Provider_certification_fixture_drift"
BEFORE UPDATE OF "accountPurpose" ON "Provider"
FOR EACH ROW EXECUTE FUNCTION fastt_prevent_certification_provider_purpose_drift();
