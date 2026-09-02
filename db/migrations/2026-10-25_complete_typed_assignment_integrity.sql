-- Finish the typed-assignment cutover and make tenant ownership invariant under
-- both child writes and later parent ownership changes.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "PolicyExceptionRule" exception
		LEFT JOIN "Product" product
			ON exception."scope" = 'product' AND product."id" = exception."scopeId"
		LEFT JOIN "Variant" variant
			ON exception."scope" = 'variant' AND variant."id" = exception."scopeId"
		LEFT JOIN "RatePlan" rate_plan
			ON exception."scope" = 'rate_plan' AND rate_plan."id" = exception."scopeId"
		WHERE exception."scope" NOT IN ('global', 'product', 'variant', 'rate_plan')
			OR (exception."scope" = 'global' AND exception."scopeId" IS NOT NULL)
			OR (exception."scope" = 'product' AND product."id" IS NULL)
			OR (exception."scope" = 'variant' AND variant."id" IS NULL)
			OR (exception."scope" = 'rate_plan' AND rate_plan."id" IS NULL)
	) THEN
		RAISE EXCEPTION 'POLICY_EXCEPTION_TYPED_TARGET_PRECHECK_FAILED';
	END IF;
END;
$$;

DROP INDEX IF EXISTS "PolicyExceptionRule_context_type_active_idx";
DROP INDEX IF EXISTS "PolicyExceptionRule_context_priority_idx";

ALTER TABLE "PolicyExceptionRule"
	ADD COLUMN "productTargetId" text,
	ADD COLUMN "variantTargetId" text,
	ADD COLUMN "ratePlanTargetId" text;

UPDATE "PolicyExceptionRule"
SET "productTargetId" = CASE WHEN "scope" = 'product' THEN "scopeId" ELSE NULL END,
	"variantTargetId" = CASE WHEN "scope" = 'variant' THEN "scopeId" ELSE NULL END,
	"ratePlanTargetId" = CASE WHEN "scope" = 'rate_plan' THEN "scopeId" ELSE NULL END;

ALTER TABLE "PolicyExceptionRule" DROP COLUMN "scopeId";
ALTER TABLE "PolicyExceptionRule"
	ADD COLUMN "scopeId" text GENERATED ALWAYS AS (
		coalesce("productTargetId", "variantTargetId", "ratePlanTargetId")
	) STORED,
	ADD CONSTRAINT "PolicyExceptionRule_productTargetId_fk"
		FOREIGN KEY ("productTargetId") REFERENCES "Product" ("id"),
	ADD CONSTRAINT "PolicyExceptionRule_variantTargetId_fk"
		FOREIGN KEY ("variantTargetId") REFERENCES "Variant" ("id"),
	ADD CONSTRAINT "PolicyExceptionRule_ratePlanTargetId_fk"
		FOREIGN KEY ("ratePlanTargetId") REFERENCES "RatePlan" ("id"),
	ADD CONSTRAINT "PolicyExceptionRule_typed_target_check"
		CHECK (
			("scope" = 'global' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
			OR ("scope" = 'product' AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
			OR ("scope" = 'variant' AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
			OR ("scope" = 'rate_plan' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
		),
	ADD CONSTRAINT "PolicyExceptionRule_category_check"
		CHECK ("category" IS NULL OR "category" IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')),
	ADD CONSTRAINT "PolicyExceptionRule_effective_range_check"
		CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

CREATE INDEX "PolicyExceptionRule_context_type_active_idx"
	ON "PolicyExceptionRule" ("scope", "scopeId", "category", "type", "isActive");
CREATE INDEX "PolicyExceptionRule_context_priority_idx"
	ON "PolicyExceptionRule" ("scope", "scopeId", "isActive", "priority");

-- Lock the complete ownership chain while validating a child write. This
-- serializes assignments with concurrent product/variant/rate-plan transfers.
CREATE OR REPLACE FUNCTION fastt_catalog_assignment_target_provider(
	product_target_id text,
	variant_target_id text,
	rate_plan_target_id text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE target_provider_id text;
BEGIN
	IF product_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "Product" product
		WHERE product."id" = product_target_id
		FOR SHARE OF product;
	ELSIF variant_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "Variant" variant
		JOIN "Product" product ON product."id" = variant."productId"
		WHERE variant."id" = variant_target_id
		FOR SHARE OF variant, product;
	ELSIF rate_plan_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "RatePlan" rate_plan
		JOIN "Variant" variant ON variant."id" = rate_plan."variantId"
		JOIN "Product" product ON product."id" = variant."productId"
		WHERE rate_plan."id" = rate_plan_target_id
		FOR SHARE OF rate_plan, variant, product;
	END IF;
	RETURN target_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_assignment_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition_provider_id text; target_provider_id text;
BEGIN
	SELECT "providerId" INTO definition_provider_id
	FROM "TaxFeeDefinition"
	WHERE "id" = NEW."taxFeeDefinitionId"
	FOR SHARE;
	IF NEW."scope" = 'global' THEN RETURN NEW; END IF;
	IF NEW."scope" = 'provider' THEN
		SELECT "id" INTO target_provider_id FROM "Provider" WHERE "id" = NEW."providerTargetId" FOR SHARE;
	ELSE
		target_provider_id := fastt_catalog_assignment_target_provider(
			NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
		);
	END IF;
	IF definition_provider_id IS NULL OR target_provider_id IS NULL OR definition_provider_id <> target_provider_id THEN
		RAISE EXCEPTION 'TAX_FEE_ASSIGNMENT_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_policy_assignment_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_provider_id text; target_provider_id text;
BEGIN
	SELECT "ownerProviderId" INTO group_provider_id
	FROM "PolicyGroup"
	WHERE "id" = NEW."policyGroupId"
	FOR SHARE;
	target_provider_id := fastt_catalog_assignment_target_provider(
		NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
	);
	IF group_provider_id IS NULL OR target_provider_id IS NULL OR group_provider_id <> target_provider_id THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_commercial_rule_application_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule_provider_id text; rule_set_provider_id text; rule_set_id text; target_provider_id text;
BEGIN
	SELECT "providerId", "ruleSetId" INTO rule_provider_id, rule_set_id
	FROM "CommercialRule" WHERE "id" = NEW."ruleId" FOR SHARE;
	SELECT "providerId" INTO rule_set_provider_id
	FROM "CommercialRuleSet" WHERE "id" = NEW."ruleSetId" FOR SHARE;
	target_provider_id := fastt_catalog_assignment_target_provider(
		NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
	);
	IF rule_provider_id IS NULL OR rule_set_provider_id IS NULL OR target_provider_id IS NULL
		OR NEW."providerId" <> rule_provider_id
		OR NEW."providerId" <> rule_set_provider_id
		OR NEW."ruleSetId" <> rule_set_id
		OR NEW."providerId" <> target_provider_id THEN
		RAISE EXCEPTION 'COMMERCIAL_RULE_APPLICATION_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_catalog_assignment_owner_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_provider_id text;
DECLARE new_provider_id text;
BEGIN
	IF TG_TABLE_NAME = 'Product' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'PRODUCT_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
		RETURN NEW;
	ELSIF TG_TABLE_NAME = 'Variant' THEN
		IF NEW."productId" IS NOT DISTINCT FROM OLD."productId" THEN RETURN NEW; END IF;
		SELECT p."providerId" INTO old_provider_id FROM "Product" p WHERE p."id" = OLD."productId";
		SELECT p."providerId" INTO new_provider_id FROM "Product" p WHERE p."id" = NEW."productId";
		IF old_provider_id IS DISTINCT FROM new_provider_id THEN
			RAISE EXCEPTION 'VARIANT_CROSS_PROVIDER_MOVE_BLOCKED';
		END IF;
		RETURN NEW;
	ELSE
		IF NEW."variantId" IS NOT DISTINCT FROM OLD."variantId" THEN RETURN NEW; END IF;
		SELECT p."providerId" INTO old_provider_id FROM "Variant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."id" = OLD."variantId";
		SELECT p."providerId" INTO new_provider_id FROM "Variant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."id" = NEW."variantId";
		IF old_provider_id IS DISTINCT FROM new_provider_id THEN
			RAISE EXCEPTION 'RATE_PLAN_CROSS_PROVIDER_MOVE_BLOCKED';
		END IF;
		RETURN NEW;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_rule_assignment_owner_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'TaxFeeDefinition'
		AND NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
		RAISE EXCEPTION 'TAX_FEE_DEFINITION_PROVIDER_IDENTITY_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'PolicyGroup'
		AND NEW."ownerProviderId" IS DISTINCT FROM OLD."ownerProviderId" THEN
		RAISE EXCEPTION 'POLICY_GROUP_PROVIDER_IDENTITY_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'CommercialRule'
		AND (NEW."providerId" IS DISTINCT FROM OLD."providerId" OR NEW."ruleSetId" IS DISTINCT FROM OLD."ruleSetId") THEN
		RAISE EXCEPTION 'COMMERCIAL_RULE_LINEAGE_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'CommercialRuleSet'
		AND NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
		RAISE EXCEPTION 'COMMERCIAL_RULE_SET_PROVIDER_IDENTITY_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_Product_assignment_owner_drift" ON "Product";
CREATE TRIGGER "trg_Product_assignment_owner_drift" BEFORE UPDATE OF "providerId" ON "Product" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_Variant_assignment_owner_drift" ON "Variant";
CREATE TRIGGER "trg_Variant_assignment_owner_drift" BEFORE UPDATE OF "productId" ON "Variant" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_RatePlan_assignment_owner_drift" ON "RatePlan";
CREATE TRIGGER "trg_RatePlan_assignment_owner_drift" BEFORE UPDATE OF "variantId" ON "RatePlan" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_TaxFeeDefinition_assignment_owner_drift" ON "TaxFeeDefinition";
CREATE TRIGGER "trg_TaxFeeDefinition_assignment_owner_drift" BEFORE UPDATE OF "providerId" ON "TaxFeeDefinition" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_PolicyGroup_assignment_owner_drift" ON "PolicyGroup";
CREATE TRIGGER "trg_PolicyGroup_assignment_owner_drift" BEFORE UPDATE OF "ownerProviderId" ON "PolicyGroup" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_CommercialRule_assignment_owner_drift" ON "CommercialRule";
CREATE TRIGGER "trg_CommercialRule_assignment_owner_drift" BEFORE UPDATE OF "providerId", "ruleSetId" ON "CommercialRule" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_CommercialRuleSet_assignment_owner_drift" ON "CommercialRuleSet";
CREATE TRIGGER "trg_CommercialRuleSet_assignment_owner_drift" BEFORE UPDATE OF "providerId" ON "CommercialRuleSet" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
