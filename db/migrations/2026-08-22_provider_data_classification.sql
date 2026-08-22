-- Dataset provenance is separate from accountPurpose. Public marketplace reads
-- will later admit only production data; this migration intentionally does not
-- change visibility until the marketplace read model is migrated.
ALTER TABLE "Provider"
	ADD COLUMN IF NOT EXISTS "dataClassification" text NOT NULL DEFAULT 'production';

UPDATE "Provider"
SET "dataClassification" = 'production'
WHERE "dataClassification" IS NULL
	OR "dataClassification" NOT IN ('production', 'demo', 'fixture');

-- Reclassify only the two controlled seeds whose identity is stable in source.
-- All other historical rows remain production until the phase-2 audit reviews them.
UPDATE "Provider"
SET "dataClassification" = 'fixture'
WHERE "accountPurpose" = 'integration_certification'
	OR "id" = 'fastt-channex-certification-provider-v1';

UPDATE "Provider"
SET "dataClassification" = 'demo'
WHERE "id" = 'qa-financial-provider-ellaggon'
	OR (
		"legalName" = 'Fastt Demo S.R.L.'
		AND "displayName" = 'Hotel Sol'
	);

ALTER TABLE "Provider"
	DROP CONSTRAINT IF EXISTS "Provider_dataClassification_check";
ALTER TABLE "Provider"
	ADD CONSTRAINT "Provider_dataClassification_check"
	CHECK ("dataClassification" IN ('production', 'demo', 'fixture'));

CREATE INDEX IF NOT EXISTS "Provider_dataClassification_idx"
	ON "Provider" ("dataClassification");
