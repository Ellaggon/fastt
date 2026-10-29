-- Additive declaration migration. Existing declarations and signed policies are not inferred or rewritten.
ALTER TABLE "ProviderHolderProfile" ADD COLUMN IF NOT EXISTS "legalFormCode" text;
ALTER TABLE "TourOperationalResource" ADD COLUMN IF NOT EXISTS "declarationJson" jsonb;
ALTER TABLE "TourComplianceContext" ADD COLUMN IF NOT EXISTS "operationJson" jsonb;
ALTER TABLE "TourComplianceContext" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0;

ALTER TABLE "ProviderHolderProfile" DROP CONSTRAINT IF EXISTS "ProviderHolderProfile_legalFormCountry_check";
ALTER TABLE "ProviderHolderProfile" ADD CONSTRAINT "ProviderHolderProfile_legalFormCountry_check"
CHECK ("legalFormCode" IS NULL OR split_part("legalFormCode", ':', 1) = "holderCountry");
ALTER TABLE "TourOperationalResource" DROP CONSTRAINT IF EXISTS "TourOperationalResource_declaration_check";
ALTER TABLE "TourOperationalResource" ADD CONSTRAINT "TourOperationalResource_declaration_check"
CHECK (("declarationJson" IS NULL AND "type" <> 'service_operator') OR ((jsonb_typeof("declarationJson") = 'object' AND "declarationJson"->>'country' ~ '^[A-Z]{2}$') IS TRUE));
ALTER TABLE "TourComplianceContext" DROP CONSTRAINT IF EXISTS "TourComplianceContext_revision_check";
ALTER TABLE "TourComplianceContext" ADD CONSTRAINT "TourComplianceContext_revision_check" CHECK ("revision" >= 0);
ALTER TABLE "TourComplianceContext" DROP CONSTRAINT IF EXISTS "TourComplianceContext_operation_check";
ALTER TABLE "TourComplianceContext" ADD CONSTRAINT "TourComplianceContext_operation_check"
CHECK ("operationJson" IS NULL OR ((jsonb_typeof("operationJson") = 'object'
  AND "operationJson"->>'version' = '2'
  AND "operationJson"->>'executionMode' IN ('self', 'team', 'external')
  AND jsonb_typeof("operationJson"->'transportServices') = 'array'
  AND jsonb_typeof("operationJson"->'resourceIds') = 'array'
  AND jsonb_typeof("operationJson"->'guidingService') = 'boolean'
  AND jsonb_typeof("operationJson"->'waterActivity') = 'boolean'
  AND jsonb_typeof("operationJson"->'airActivity') = 'boolean'
  AND "operationJson"->>'foodHandling' IN ('none', 'visit', 'serve', 'prepare')) IS TRUE));
