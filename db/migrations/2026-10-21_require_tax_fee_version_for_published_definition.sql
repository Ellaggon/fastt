-- A fiscal definition is sellable only through an immutable current version.
-- This is intentionally a separate migration: 2026-10-20 is already applied
-- and migration history is append-only.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "TaxFeeDefinition"
		WHERE "editingState" = 'published'
			AND "currentVersionId" IS NULL
	) THEN
		RAISE EXCEPTION 'TAX_FEE_PUBLISHED_VERSION_PRECHECK_FAILED';
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_definition_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."editingState" = 'published' AND NEW."currentVersionId" IS NULL THEN
		RAISE EXCEPTION 'TAX_FEE_PUBLISHED_DEFINITION_REQUIRES_CURRENT_VERSION';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeDefinition_published_version_required" ON "TaxFeeDefinition";
CREATE CONSTRAINT TRIGGER "trg_TaxFeeDefinition_published_version_required"
AFTER INSERT OR UPDATE OF "editingState", "currentVersionId" ON "TaxFeeDefinition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_tax_fee_definition_publication();
