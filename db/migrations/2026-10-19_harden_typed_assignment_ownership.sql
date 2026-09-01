-- Typed target FKs prevent dangling IDs. This migration additionally prevents
-- valid targets from being combined across providers or rule sets.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "TaxFeeAssignment" assignment
		JOIN "TaxFeeDefinition" definition ON definition."id" = assignment."taxFeeDefinitionId"
		LEFT JOIN "Product" product ON product."id" = assignment."productTargetId"
		LEFT JOIN "Variant" variant ON variant."id" = assignment."variantTargetId"
		LEFT JOIN "Product" variant_product ON variant_product."id" = variant."productId"
		LEFT JOIN "RatePlan" rate_plan ON rate_plan."id" = assignment."ratePlanTargetId"
		LEFT JOIN "Variant" rate_variant ON rate_variant."id" = rate_plan."variantId"
		LEFT JOIN "Product" rate_product ON rate_product."id" = rate_variant."productId"
		WHERE assignment."scope" <> 'global' AND (
			definition."providerId" IS NULL
			OR (assignment."scope" = 'provider' AND assignment."providerTargetId" IS DISTINCT FROM definition."providerId")
			OR (assignment."scope" = 'product' AND product."providerId" IS DISTINCT FROM definition."providerId")
			OR (assignment."scope" = 'variant' AND variant_product."providerId" IS DISTINCT FROM definition."providerId")
			OR (assignment."scope" = 'rate_plan' AND rate_product."providerId" IS DISTINCT FROM definition."providerId")
		)
	) THEN RAISE EXCEPTION 'TYPED_ASSIGNMENT_TAX_FEE_PROVIDER_PRECHECK_FAILED'; END IF;

	IF EXISTS (
		SELECT 1 FROM "PolicyAssignment" assignment
		JOIN "PolicyGroup" policy_group ON policy_group."id" = assignment."policyGroupId"
		LEFT JOIN "Product" product ON product."id" = assignment."productTargetId"
		LEFT JOIN "Variant" variant ON variant."id" = assignment."variantTargetId"
		LEFT JOIN "Product" variant_product ON variant_product."id" = variant."productId"
		LEFT JOIN "RatePlan" rate_plan ON rate_plan."id" = assignment."ratePlanTargetId"
		LEFT JOIN "Variant" rate_variant ON rate_variant."id" = rate_plan."variantId"
		LEFT JOIN "Product" rate_product ON rate_product."id" = rate_variant."productId"
		WHERE (assignment."scope" = 'product' AND product."providerId" IS DISTINCT FROM policy_group."ownerProviderId")
			OR (assignment."scope" = 'variant' AND variant_product."providerId" IS DISTINCT FROM policy_group."ownerProviderId")
			OR (assignment."scope" = 'rate_plan' AND rate_product."providerId" IS DISTINCT FROM policy_group."ownerProviderId")
	) THEN RAISE EXCEPTION 'TYPED_ASSIGNMENT_POLICY_PROVIDER_PRECHECK_FAILED'; END IF;

	IF EXISTS (
		SELECT 1 FROM "CommercialRuleApplication" assignment
		JOIN "CommercialRule" rule ON rule."id" = assignment."ruleId"
		JOIN "CommercialRuleSet" rule_set ON rule_set."id" = assignment."ruleSetId"
		LEFT JOIN "Product" product ON product."id" = assignment."productTargetId"
		LEFT JOIN "Variant" variant ON variant."id" = assignment."variantTargetId"
		LEFT JOIN "Product" variant_product ON variant_product."id" = variant."productId"
		LEFT JOIN "RatePlan" rate_plan ON rate_plan."id" = assignment."ratePlanTargetId"
		LEFT JOIN "Variant" rate_variant ON rate_variant."id" = rate_plan."variantId"
		LEFT JOIN "Product" rate_product ON rate_product."id" = rate_variant."productId"
		WHERE assignment."providerId" IS DISTINCT FROM rule."providerId"
			OR assignment."providerId" IS DISTINCT FROM rule_set."providerId"
			OR assignment."ruleSetId" IS DISTINCT FROM rule."ruleSetId"
			OR (assignment."scope" = 'product' AND product."providerId" IS DISTINCT FROM assignment."providerId")
			OR (assignment."scope" = 'variant' AND variant_product."providerId" IS DISTINCT FROM assignment."providerId")
			OR (assignment."scope" = 'rate_plan' AND rate_product."providerId" IS DISTINCT FROM assignment."providerId")
	) THEN RAISE EXCEPTION 'TYPED_ASSIGNMENT_COMMERCIAL_PROVIDER_PRECHECK_FAILED'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_catalog_assignment_target_provider(product_target_id text, variant_target_id text, rate_plan_target_id text)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE target_provider_id text;
BEGIN
	IF product_target_id IS NOT NULL THEN
		SELECT "providerId" INTO target_provider_id FROM "Product" WHERE "id" = product_target_id;
	ELSIF variant_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id FROM "Variant" variant JOIN "Product" product ON product."id" = variant."productId" WHERE variant."id" = variant_target_id;
	ELSIF rate_plan_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id FROM "RatePlan" rate_plan JOIN "Variant" variant ON variant."id" = rate_plan."variantId" JOIN "Product" product ON product."id" = variant."productId" WHERE rate_plan."id" = rate_plan_target_id;
	END IF;
	RETURN target_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_assignment_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition_provider_id text; target_provider_id text;
BEGIN
	SELECT "providerId" INTO definition_provider_id FROM "TaxFeeDefinition" WHERE "id" = NEW."taxFeeDefinitionId";
	IF NEW."scope" = 'global' THEN RETURN NEW; END IF;
	IF NEW."scope" = 'provider' THEN target_provider_id := NEW."providerTargetId";
	ELSE target_provider_id := fastt_catalog_assignment_target_provider(NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"); END IF;
	IF definition_provider_id IS NULL OR target_provider_id IS NULL OR definition_provider_id <> target_provider_id THEN RAISE EXCEPTION 'TAX_FEE_ASSIGNMENT_PROVIDER_MISMATCH'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_policy_assignment_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_provider_id text; target_provider_id text;
BEGIN
	SELECT "ownerProviderId" INTO group_provider_id FROM "PolicyGroup" WHERE "id" = NEW."policyGroupId";
	target_provider_id := fastt_catalog_assignment_target_provider(NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId");
	IF group_provider_id IS NULL OR target_provider_id IS NULL OR group_provider_id <> target_provider_id THEN RAISE EXCEPTION 'POLICY_ASSIGNMENT_PROVIDER_MISMATCH'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_commercial_rule_application_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule_provider_id text; rule_set_provider_id text; rule_set_id text; target_provider_id text;
BEGIN
	SELECT "providerId", "ruleSetId" INTO rule_provider_id, rule_set_id FROM "CommercialRule" WHERE "id" = NEW."ruleId";
	SELECT "providerId" INTO rule_set_provider_id FROM "CommercialRuleSet" WHERE "id" = NEW."ruleSetId";
	target_provider_id := fastt_catalog_assignment_target_provider(NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId");
	IF rule_provider_id IS NULL OR rule_set_provider_id IS NULL OR target_provider_id IS NULL OR NEW."providerId" <> rule_provider_id OR NEW."providerId" <> rule_set_provider_id OR NEW."ruleSetId" <> rule_set_id OR NEW."providerId" <> target_provider_id THEN RAISE EXCEPTION 'COMMERCIAL_RULE_APPLICATION_PROVIDER_MISMATCH'; END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeAssignment_owner" ON "TaxFeeAssignment";
CREATE TRIGGER "trg_TaxFeeAssignment_owner" BEFORE INSERT OR UPDATE OF "taxFeeDefinitionId", "scope", "providerTargetId", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "TaxFeeAssignment" FOR EACH ROW EXECUTE FUNCTION fastt_validate_tax_fee_assignment_owner();
DROP TRIGGER IF EXISTS "trg_PolicyAssignment_owner" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_owner" BEFORE INSERT OR UPDATE OF "policyGroupId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "PolicyAssignment" FOR EACH ROW EXECUTE FUNCTION fastt_validate_policy_assignment_owner();
DROP TRIGGER IF EXISTS "trg_CommercialRuleApplication_owner" ON "CommercialRuleApplication";
CREATE TRIGGER "trg_CommercialRuleApplication_owner" BEFORE INSERT OR UPDATE OF "providerId", "ruleSetId", "ruleId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "CommercialRuleApplication" FOR EACH ROW EXECUTE FUNCTION fastt_validate_commercial_rule_application_owner();
