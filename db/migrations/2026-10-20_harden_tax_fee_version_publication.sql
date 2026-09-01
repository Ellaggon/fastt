-- TaxFeeDefinitionVersion is fiscal evidence. The definition may point to a
-- later version, but historical snapshots must never be changed or removed.
-- The same-definition, deferred FK was introduced in 2026-10-02; this
-- migration intentionally adds the remaining append-only enforcement.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "TaxFeeDefinition" definition
		LEFT JOIN "TaxFeeDefinitionVersion" version
			ON version."id" = definition."currentVersionId"
			AND version."taxFeeDefinitionId" = definition."id"
		WHERE definition."currentVersionId" IS NOT NULL
			AND version."id" IS NULL
	) THEN
		RAISE EXCEPTION 'TAX_FEE_CURRENT_VERSION_PRECHECK_FAILED';
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_tax_fee_definition_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'TAX_FEE_DEFINITION_VERSION_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeDefinitionVersion_immutable" ON "TaxFeeDefinitionVersion";
CREATE TRIGGER "trg_TaxFeeDefinitionVersion_immutable"
BEFORE UPDATE OR DELETE ON "TaxFeeDefinitionVersion"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_tax_fee_definition_version_mutation();
