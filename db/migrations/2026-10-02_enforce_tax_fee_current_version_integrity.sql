-- TaxFeeDefinition.currentVersionId is not merely a pointer to any version.
-- It must identify an immutable version owned by that same definition. Validate
-- existing data first, then make the invariant database-enforced and deferrable
-- for the publication transaction.

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
		RAISE EXCEPTION
			'USABLE_CURRENT_TAX_FEE_VERSION_MISMATCH: every currentVersionId must reference a version of the same definition';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'TaxFeeDefinitionVersion_definition_id_unique'
			AND conrelid = '"TaxFeeDefinitionVersion"'::regclass
	) THEN
		ALTER TABLE "TaxFeeDefinitionVersion"
			ADD CONSTRAINT "TaxFeeDefinitionVersion_definition_id_unique"
			UNIQUE ("taxFeeDefinitionId", "id");
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'TaxFeeDefinition_currentVersion_same_definition_fk'
			AND conrelid = '"TaxFeeDefinition"'::regclass
	) THEN
		ALTER TABLE "TaxFeeDefinition"
			ADD CONSTRAINT "TaxFeeDefinition_currentVersion_same_definition_fk"
			FOREIGN KEY ("id", "currentVersionId")
			REFERENCES "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "id")
			DEFERRABLE INITIALLY DEFERRED;
	END IF;
END;
$$;
