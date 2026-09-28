-- The collection model belongs to the provider's commercial line. Existing
-- account-level values are intentionally not copied: a mixed provider must
-- declare each line before it can authorize new commercial capabilities.

ALTER TABLE "ProviderCommercialLine"
  ADD COLUMN IF NOT EXISTS "collectionModel" text NOT NULL DEFAULT 'undecided',
  ADD COLUMN IF NOT EXISTS "collectionDeclaredByUserId" text,
  ADD COLUMN IF NOT EXISTS "collectionDeclaredAt" timestamptz;

DO $$ BEGIN
  ALTER TABLE "ProviderCommercialLine"
    ADD CONSTRAINT "ProviderCommercialLine_collectionModel_check"
    CHECK ("collectionModel" IN ('undecided', 'property_collect', 'platform_collect'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderCommercialLine"
    ADD CONSTRAINT "ProviderCommercialLine_collectionDeclaredByUserId_fk"
    FOREIGN KEY ("collectionDeclaredByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
