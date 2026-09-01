-- Keep editable fiscal changes outside the definition currently used by sales.
CREATE TABLE IF NOT EXISTS "TaxFeeDefinitionDraft" (
  "definitionId" text PRIMARY KEY REFERENCES "TaxFeeDefinition"("id"),
  "baseVersionId" text REFERENCES "TaxFeeDefinitionVersion"("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "calculationType" text NOT NULL,
  "value" numeric NOT NULL,
  "currency" text,
  "inclusionType" text NOT NULL,
  "appliesPer" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 0,
  "jurisdictionJson" jsonb,
  "effectiveFrom" timestamptz,
  "effectiveTo" timestamptz,
  "updatedByUserId" text REFERENCES "User"("id"),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TaxFeeDefinitionDraft_base_version_idx"
  ON "TaxFeeDefinitionDraft" ("baseVersionId");
