ALTER TABLE "TaxFeeDefinition"
	ADD COLUMN IF NOT EXISTS "editingState" text NOT NULL DEFAULT 'published',
	ADD COLUMN IF NOT EXISTS "currentVersionId" text;

CREATE TABLE IF NOT EXISTS "TaxFeeDefinitionVersion" (
	"id" text PRIMARY KEY,
	"taxFeeDefinitionId" text NOT NULL REFERENCES "TaxFeeDefinition"("id"),
	"version" integer NOT NULL,
	"publicationState" text NOT NULL,
	"snapshotJson" jsonb NOT NULL,
	"createdByUserId" text REFERENCES "User"("id"),
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxFeeDefinitionVersion_definition_version_unique"
	ON "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "version");
CREATE INDEX IF NOT EXISTS "TaxFeeDefinitionVersion_definition_created_idx"
	ON "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "createdAt");
