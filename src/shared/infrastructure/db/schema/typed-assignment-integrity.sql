-- Child writes lock and validate the complete ownership chain. Parent ownership
-- identities are immutable; aggregate transfers must use an explicit migration.
CREATE OR REPLACE FUNCTION fastt_catalog_assignment_target_provider(
	product_target_id text,
	variant_target_id text,
	rate_plan_target_id text
)
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE target_provider_id text;
BEGIN
	IF product_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "Product" product WHERE product."id" = product_target_id
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
	FROM "TaxFeeDefinition" WHERE "id" = NEW."taxFeeDefinitionId" FOR SHARE;
	IF NEW."scope" = 'global' THEN RETURN NEW; END IF;
	IF NEW."scope" = 'provider' THEN
		SELECT "id" INTO target_provider_id
		FROM "Provider" WHERE "id" = NEW."providerTargetId" FOR SHARE;
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
	FROM "PolicyGroup" WHERE "id" = NEW."policyGroupId" FOR SHARE;
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
		OR NEW."providerId" <> rule_provider_id OR NEW."providerId" <> rule_set_provider_id
		OR NEW."ruleSetId" <> rule_set_id OR NEW."providerId" <> target_provider_id THEN
		RAISE EXCEPTION 'COMMERCIAL_RULE_APPLICATION_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_catalog_assignment_owner_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_provider_id text; new_provider_id text;
BEGIN
	IF TG_TABLE_NAME = 'Product' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'PRODUCT_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'Variant' AND NEW."productId" IS DISTINCT FROM OLD."productId" THEN
		SELECT p."providerId" INTO old_provider_id FROM "Product" p WHERE p."id" = OLD."productId";
		SELECT p."providerId" INTO new_provider_id FROM "Product" p WHERE p."id" = NEW."productId";
		IF old_provider_id IS DISTINCT FROM new_provider_id THEN RAISE EXCEPTION 'VARIANT_CROSS_PROVIDER_MOVE_BLOCKED'; END IF;
	ELSIF TG_TABLE_NAME = 'RatePlan' AND NEW."variantId" IS DISTINCT FROM OLD."variantId" THEN
		SELECT p."providerId" INTO old_provider_id FROM "Variant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."id" = OLD."variantId";
		SELECT p."providerId" INTO new_provider_id FROM "Variant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."id" = NEW."variantId";
		IF old_provider_id IS DISTINCT FROM new_provider_id THEN RAISE EXCEPTION 'RATE_PLAN_CROSS_PROVIDER_MOVE_BLOCKED'; END IF;
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_rule_assignment_owner_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'TaxFeeDefinition' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'TAX_FEE_DEFINITION_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'PolicyGroup' THEN
		IF NEW."ownerProviderId" IS DISTINCT FROM OLD."ownerProviderId" THEN
			RAISE EXCEPTION 'POLICY_GROUP_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'CommercialRule' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId"
			OR NEW."ruleSetId" IS DISTINCT FROM OLD."ruleSetId" THEN
			RAISE EXCEPTION 'COMMERCIAL_RULE_LINEAGE_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'CommercialRuleSet' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'COMMERCIAL_RULE_SET_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeAssignment_owner" ON "TaxFeeAssignment";
CREATE TRIGGER "trg_TaxFeeAssignment_owner" BEFORE INSERT OR UPDATE OF "taxFeeDefinitionId", "scope", "providerTargetId", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "TaxFeeAssignment" FOR EACH ROW EXECUTE FUNCTION fastt_validate_tax_fee_assignment_owner();
DROP TRIGGER IF EXISTS "trg_PolicyAssignment_owner" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_owner" BEFORE INSERT OR UPDATE OF "policyGroupId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "PolicyAssignment" FOR EACH ROW EXECUTE FUNCTION fastt_validate_policy_assignment_owner();
DROP TRIGGER IF EXISTS "trg_CommercialRuleApplication_owner" ON "CommercialRuleApplication";
CREATE TRIGGER "trg_CommercialRuleApplication_owner" BEFORE INSERT OR UPDATE OF "providerId", "ruleSetId", "ruleId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "CommercialRuleApplication" FOR EACH ROW EXECUTE FUNCTION fastt_validate_commercial_rule_application_owner();

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
