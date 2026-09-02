-- PL/pgSQL records expose only the fields of their trigger table. Dispatch on
-- TG_TABLE_NAME before reading table-specific ownership columns.
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
