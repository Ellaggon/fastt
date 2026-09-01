-- Provider integration mappings are polymorphic by connector, but their local
-- side follows a finite Fastt vocabulary. Preserve invalid historical rows as
-- audit evidence, then remove them before adding canonical constraints.
WITH invalid_pairs AS (
	SELECT mapping."id", mapping."providerId", mapping."mappingType", mapping."localEntityType", mapping."localEntityId"
	FROM "ProviderIntegrationMapping" mapping
	WHERE NOT (
		(mapping."mappingType" = 'property' AND mapping."localEntityType" = 'product')
		OR (mapping."mappingType" = 'room_type' AND mapping."localEntityType" = 'variant')
		OR (mapping."mappingType" = 'rate_plan' AND mapping."localEntityType" = 'rate_plan')
		OR (mapping."mappingType" = 'tax' AND mapping."localEntityType" = 'tax')
		OR (mapping."mappingType" = 'account' AND mapping."localEntityType" = 'provider')
		OR (mapping."mappingType" = 'calendar' AND mapping."localEntityType" = 'calendar')
	)
)
INSERT INTO "ProviderAuditLog" (
	"id", "providerId", "action", "entityType", "entityId", "beforeJson", "afterJson", "riskLevel", "createdAt"
)
SELECT
	'migration:provider-integration-mapping-contract:invalid-pair:' || "id",
	"providerId",
	'provider.integration.mapping.invalid_pair_removed',
	'ProviderIntegrationMapping',
	"id",
	jsonb_build_object('mappingType', "mappingType", 'localEntityType', "localEntityType", 'localEntityId', "localEntityId"),
	jsonb_build_object('reason', 'unsupported_mapping_type_and_local_entity_pair'),
	'warning',
	CURRENT_TIMESTAMP
FROM invalid_pairs
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "ProviderIntegrationMapping" mapping
WHERE NOT (
	(mapping."mappingType" = 'property' AND mapping."localEntityType" = 'product')
	OR (mapping."mappingType" = 'room_type' AND mapping."localEntityType" = 'variant')
	OR (mapping."mappingType" = 'rate_plan' AND mapping."localEntityType" = 'rate_plan')
	OR (mapping."mappingType" = 'tax' AND mapping."localEntityType" = 'tax')
	OR (mapping."mappingType" = 'account' AND mapping."localEntityType" = 'provider')
	OR (mapping."mappingType" = 'calendar' AND mapping."localEntityType" = 'calendar')
);

WITH stale_mappings AS (
	SELECT mapping."id", mapping."providerId", mapping."mappingType", mapping."localEntityType", mapping."localEntityId"
	FROM "ProviderIntegrationMapping" mapping
	WHERE NOT (
		(mapping."mappingType" = 'property' AND EXISTS (SELECT 1 FROM "Product" product WHERE product."id" = mapping."localEntityId" AND product."providerId" = mapping."providerId"))
		OR (mapping."mappingType" = 'room_type' AND EXISTS (SELECT 1 FROM "Variant" variant JOIN "Product" product ON product."id" = variant."productId" WHERE variant."id" = mapping."localEntityId" AND product."providerId" = mapping."providerId"))
		OR (mapping."mappingType" = 'rate_plan' AND EXISTS (SELECT 1 FROM "RatePlan" rate_plan JOIN "Variant" variant ON variant."id" = rate_plan."variantId" JOIN "Product" product ON product."id" = variant."productId" WHERE rate_plan."id" = mapping."localEntityId" AND product."providerId" = mapping."providerId"))
		OR (mapping."mappingType" = 'tax' AND EXISTS (SELECT 1 FROM "TaxFeeDefinition" tax WHERE tax."id" = mapping."localEntityId" AND tax."providerId" = mapping."providerId"))
		OR (mapping."mappingType" = 'calendar' AND EXISTS (SELECT 1 FROM "ProviderExternalCalendar" calendar WHERE calendar."id" = mapping."localEntityId" AND calendar."providerId" = mapping."providerId"))
		OR (mapping."mappingType" = 'account' AND mapping."localEntityId" = mapping."providerId")
	)
)
INSERT INTO "ProviderAuditLog" (
	"id", "providerId", "action", "entityType", "entityId", "beforeJson", "afterJson", "riskLevel", "createdAt"
)
SELECT
	'migration:provider-integration-mapping-contract:stale-local:' || "id",
	"providerId",
	'provider.integration.mapping.local_entity_deactivated',
	'ProviderIntegrationMapping',
	"id",
	jsonb_build_object('mappingType', "mappingType", 'localEntityType', "localEntityType", 'localEntityId', "localEntityId"),
	jsonb_build_object('reason', 'local_entity_missing_or_not_owned', 'status', 'inactive'),
	'warning',
	CURRENT_TIMESTAMP
FROM stale_mappings
ON CONFLICT ("id") DO NOTHING;

UPDATE "ProviderIntegrationMapping" mapping
SET
	"status" = 'inactive',
	"metadataJson" = jsonb_set(
		COALESCE(mapping."metadataJson", '{}'::jsonb),
		'{localEntityIntegrity}',
		jsonb_build_object('status', 'inactive', 'reason', 'local_entity_missing_or_not_owned', 'recordedAt', CURRENT_TIMESTAMP),
		true
	),
	"updatedAt" = CURRENT_TIMESTAMP
WHERE NOT (
	(mapping."mappingType" = 'property' AND EXISTS (SELECT 1 FROM "Product" product WHERE product."id" = mapping."localEntityId" AND product."providerId" = mapping."providerId"))
	OR (mapping."mappingType" = 'room_type' AND EXISTS (SELECT 1 FROM "Variant" variant JOIN "Product" product ON product."id" = variant."productId" WHERE variant."id" = mapping."localEntityId" AND product."providerId" = mapping."providerId"))
	OR (mapping."mappingType" = 'rate_plan' AND EXISTS (SELECT 1 FROM "RatePlan" rate_plan JOIN "Variant" variant ON variant."id" = rate_plan."variantId" JOIN "Product" product ON product."id" = variant."productId" WHERE rate_plan."id" = mapping."localEntityId" AND product."providerId" = mapping."providerId"))
	OR (mapping."mappingType" = 'tax' AND EXISTS (SELECT 1 FROM "TaxFeeDefinition" tax WHERE tax."id" = mapping."localEntityId" AND tax."providerId" = mapping."providerId"))
	OR (mapping."mappingType" = 'calendar' AND EXISTS (SELECT 1 FROM "ProviderExternalCalendar" calendar WHERE calendar."id" = mapping."localEntityId" AND calendar."providerId" = mapping."providerId"))
	OR (mapping."mappingType" = 'account' AND mapping."localEntityId" = mapping."providerId")
);

WITH invalid_fixture AS (
	SELECT certification."id", certification."providerId", certification."fixtureProductId"
	FROM "ProviderIntegrationCertification" certification
	LEFT JOIN "Product" product ON product."id" = certification."fixtureProductId"
	WHERE certification."fixtureProductId" IS NOT NULL
		AND (product."id" IS NULL OR product."providerId" IS DISTINCT FROM certification."providerId" OR product."dataClass" <> 'fixture')
)
INSERT INTO "ProviderAuditLog" (
	"id", "providerId", "action", "entityType", "entityId", "beforeJson", "afterJson", "riskLevel", "createdAt"
)
SELECT
	'migration:provider-integration-mapping-contract:fixture-product:' || "id",
	"providerId",
	'provider.integration.certification.fixture_reference_repaired',
	'ProviderIntegrationCertification',
	"id",
	jsonb_build_object('fixtureProductId', "fixtureProductId"),
	jsonb_build_object('fixtureProductId', NULL, 'status', 'requires_attention', 'reason', 'fixture_product_missing_or_invalid'),
	'warning',
	CURRENT_TIMESTAMP
FROM invalid_fixture
ON CONFLICT ("id") DO NOTHING;

UPDATE "ProviderIntegrationCertification" certification
SET
	"fixtureProductId" = NULL,
	"status" = 'requires_attention',
	"evidenceManifestJson" = jsonb_set(
		COALESCE(certification."evidenceManifestJson", '{}'::jsonb),
		'{fixtureIntegrity}',
		jsonb_build_object('status', 'requires_attention', 'reason', 'fixture_product_missing_or_invalid', 'recordedAt', CURRENT_TIMESTAMP),
		true
	),
	"updatedAt" = CURRENT_TIMESTAMP
WHERE certification."fixtureProductId" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "Product" product
		WHERE product."id" = certification."fixtureProductId"
			AND product."providerId" = certification."providerId"
			AND product."dataClass" = 'fixture'
	);

ALTER TABLE "ProviderIntegrationMapping"
	ADD CONSTRAINT "ProviderIntegrationMapping_local_entity_type_check"
	CHECK ("localEntityType" IN ('provider', 'product', 'variant', 'rate_plan', 'tax', 'calendar'));

ALTER TABLE "ProviderIntegrationMapping"
	ADD CONSTRAINT "ProviderIntegrationMapping_type_local_entity_pair_check"
	CHECK (
		("mappingType" = 'property' AND "localEntityType" = 'product')
		OR ("mappingType" = 'room_type' AND "localEntityType" = 'variant')
		OR ("mappingType" = 'rate_plan' AND "localEntityType" = 'rate_plan')
		OR ("mappingType" = 'tax' AND "localEntityType" = 'tax')
		OR ("mappingType" = 'account' AND "localEntityType" = 'provider')
		OR ("mappingType" = 'calendar' AND "localEntityType" = 'calendar')
	);

ALTER TABLE "ProviderIntegrationCertification"
	ADD CONSTRAINT "ProviderIntegrationCertification_fixtureProductId_fk"
	FOREIGN KEY ("fixtureProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT;

CREATE INDEX "ProviderIntegrationCertification_fixture_product_idx"
	ON "ProviderIntegrationCertification" ("fixtureProductId");

CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_mapping_local_entity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF (NEW."mappingType" = 'property' AND NEW."localEntityType" = 'product') THEN
		IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'room_type' AND NEW."localEntityType" = 'variant') THEN
		IF NOT EXISTS (SELECT 1 FROM "Variant" variant JOIN "Product" product ON product."id" = variant."productId" WHERE variant."id" = NEW."localEntityId" AND product."providerId" = NEW."providerId") THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'rate_plan' AND NEW."localEntityType" = 'rate_plan') THEN
		IF NOT EXISTS (SELECT 1 FROM "RatePlan" rate_plan JOIN "Variant" variant ON variant."id" = rate_plan."variantId" JOIN "Product" product ON product."id" = variant."productId" WHERE rate_plan."id" = NEW."localEntityId" AND product."providerId" = NEW."providerId") THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'tax' AND NEW."localEntityType" = 'tax') THEN
		IF NOT EXISTS (SELECT 1 FROM "TaxFeeDefinition" WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'calendar' AND NEW."localEntityType" = 'calendar') THEN
		IF NOT EXISTS (SELECT 1 FROM "ProviderExternalCalendar" WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId") THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'account' AND NEW."localEntityType" = 'provider') THEN
		IF NEW."localEntityId" <> NEW."providerId" THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSE RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_TYPE_INVALID';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationMapping_local_entity" ON "ProviderIntegrationMapping";
CREATE TRIGGER "trg_ProviderIntegrationMapping_local_entity"
BEFORE INSERT OR UPDATE OF "providerId", "mappingType", "localEntityType", "localEntityId" ON "ProviderIntegrationMapping"
FOR EACH ROW EXECUTE FUNCTION fastt_validate_provider_integration_mapping_local_entity();

CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_certification_fixture()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'ProviderIntegrationCertification' THEN
		IF NOT EXISTS (SELECT 1 FROM "Provider" WHERE "id" = NEW."providerId" AND "accountPurpose" = 'integration_certification') THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_INVALID'; END IF;
		IF NEW."fixtureProductId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Product" WHERE "id" = NEW."fixtureProductId" AND "providerId" = NEW."providerId" AND "dataClass" = 'fixture') THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_INVALID'; END IF;
		RETURN NEW;
	END IF;
	IF TG_TABLE_NAME = 'Product' AND EXISTS (SELECT 1 FROM "ProviderIntegrationCertification" WHERE "fixtureProductId" = NEW."id" AND ("providerId" IS DISTINCT FROM NEW."providerId" OR NEW."dataClass" <> 'fixture')) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_DRIFT'; END IF;
	IF TG_TABLE_NAME = 'Provider' AND NEW."accountPurpose" <> 'integration_certification' AND EXISTS (SELECT 1 FROM "ProviderIntegrationCertification" WHERE "providerId" = NEW."id") THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_PURPOSE_DRIFT'; END IF;
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
FOR EACH ROW EXECUTE FUNCTION fastt_validate_provider_integration_certification_fixture();

DROP TRIGGER IF EXISTS "trg_Provider_certification_fixture_drift" ON "Provider";
CREATE TRIGGER "trg_Provider_certification_fixture_drift"
BEFORE UPDATE OF "accountPurpose" ON "Provider"
FOR EACH ROW EXECUTE FUNCTION fastt_validate_provider_integration_certification_fixture();
