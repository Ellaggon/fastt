-- Scope is additive: legacy documents remain provider-wide until a reviewer or
-- provider records a narrower scope. No existing approval is reinterpreted.
ALTER TABLE "ProviderDocument"
  ADD COLUMN IF NOT EXISTS "issuer" text,
  ADD COLUMN IF NOT EXISTS "issuedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "subjectType" text NOT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS "subjectReference" text;

DO $$ BEGIN
  ALTER TABLE "ProviderDocument" ADD CONSTRAINT "ProviderDocument_subjectType_check"
    CHECK ("subjectType" IN ('provider', 'legal_entity', 'person', 'resource', 'third_party'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ProviderDocument_provider_expiry_idx"
  ON "ProviderDocument" ("providerId", "expiresAt");

CREATE TABLE IF NOT EXISTS "TourComplianceContext" (
  "productId" text PRIMARY KEY REFERENCES "Product"("id") ON DELETE CASCADE,
  "providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE CASCADE,
  "operatingRole" text,
  "activityClassesJson" jsonb,
  "jurisdictionCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "TourComplianceContext_operatingRole_check"
    CHECK ("operatingRole" IS NULL OR "operatingRole" IN ('operator', 'guide', 'intermediary'))
);
CREATE INDEX IF NOT EXISTS "TourComplianceContext_provider_idx"
  ON "TourComplianceContext" ("providerId");

CREATE TABLE IF NOT EXISTS "ProviderDocumentScope" (
  "id" text PRIMARY KEY,
  "documentId" text NOT NULL REFERENCES "ProviderDocument"("id") ON DELETE CASCADE,
  "providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE CASCADE,
  "scopeType" text NOT NULL CHECK ("scopeType" IN ('product', 'resource', 'territory', 'activity')),
  "productId" text REFERENCES "Product"("id") ON DELETE CASCADE,
  "resourceId" text REFERENCES "TourOperationalResource"("id") ON DELETE CASCADE,
  "territoryCode" text,
  "territoryLabel" text,
  "activityClass" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ProviderDocumentScope_document_idx"
  ON "ProviderDocumentScope" ("documentId");
CREATE INDEX IF NOT EXISTS "ProviderDocumentScope_provider_product_idx"
  ON "ProviderDocumentScope" ("providerId", "productId");
CREATE INDEX IF NOT EXISTS "ProviderDocumentScope_provider_territory_idx"
  ON "ProviderDocumentScope" ("providerId", "territoryCode");
