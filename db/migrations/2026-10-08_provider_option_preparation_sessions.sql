-- Additive option sessions; existing product preparation writers remain compatible.
CREATE TABLE "ProviderOptionPreparationSession" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"productId" text,
	"playbookId" text NOT NULL,
	"writeVersion" integer NOT NULL DEFAULT 1,
	"vertical" text NOT NULL,
	"stepId" text NOT NULL,
	"variantId" text,
	"ratePlanId" text,
	"lastPath" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "ProviderOptionPreparationSession"
	ADD CONSTRAINT "ProviderOptionPreparationSession_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
	ON DELETE CASCADE;

ALTER TABLE "ProviderOptionPreparationSession"
	ADD CONSTRAINT "ProviderOptionPreparationSession_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
	ON DELETE CASCADE;

ALTER TABLE "ProviderOptionPreparationSession"
	ADD CONSTRAINT "ProviderOptionPreparationSession_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
	ON DELETE CASCADE;

CREATE INDEX "ProviderOptionPreparationSession_owner_status_updated_idx" ON "ProviderOptionPreparationSession" ("providerId", "userId", "status", "updatedAt");

CREATE INDEX "ProviderOptionPreparationSession_product_idx" ON "ProviderOptionPreparationSession" ("productId");

ALTER TABLE "ProviderOptionPreparationSession" ADD CONSTRAINT "ProviderOptionPreparationSession_playbook_check" CHECK ("playbookId" = 'add-tour-option');

ALTER TABLE "ProviderOptionPreparationSession" ADD CONSTRAINT "ProviderOptionPreparationSession_vertical_check" CHECK ("vertical" IN ('hotel', 'tour'));

ALTER TABLE "ProviderOptionPreparationSession" ADD CONSTRAINT "ProviderOptionPreparationSession_status_check" CHECK ("status" IN ('active', 'completed', 'abandoned'));

CREATE OR REPLACE FUNCTION fastt_validate_option_preparation_session() RETURNS trigger AS $$
BEGIN
 IF current_setting('fastt.preparation_write_version', true) IS DISTINCT FROM '2' OR NEW."writeVersion" <> 2 THEN RAISE EXCEPTION 'preparation_session_client_upgrade_required' USING ERRCODE = '23514'; END IF;
 IF TG_OP = 'UPDATE' AND (OLD."providerId", OLD."userId", OLD."productId", OLD."playbookId")
   IS DISTINCT FROM (NEW."providerId", NEW."userId", NEW."productId", NEW."playbookId") THEN
  RAISE EXCEPTION 'preparation_session_identity_immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW."productId" IS NULL OR NOT EXISTS (
  SELECT 1 FROM "Product" p WHERE p.id = NEW."productId" AND p."providerId" = NEW."providerId"
   AND ((lower(p."productType") = 'tour' AND NEW.vertical = 'tour' AND NEW."playbookId" = 'add-tour-option')
     OR (lower(p."productType") IN ('hotel','whole_home') AND NEW.vertical = 'hotel' AND NEW."playbookId" IN ('launch','complete-to-publish')))
 ) THEN RAISE EXCEPTION 'preparation_session_product_invalid' USING ERRCODE = '23514'; END IF;
 IF NEW."variantId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Variant" v WHERE v.id = NEW."variantId" AND v."productId" = NEW."productId"
 ) THEN RAISE EXCEPTION 'preparation_session_variant_invalid' USING ERRCODE = '23514'; END IF;
 IF NEW."ratePlanId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "RatePlan" r WHERE r.id = NEW."ratePlanId" AND r."variantId" = NEW."variantId"
 ) THEN RAISE EXCEPTION 'preparation_session_rate_invalid' USING ERRCODE = '23514'; END IF;
 IF TG_OP = 'UPDATE' AND OLD."variantId" IS NOT NULL AND OLD."variantId" IS DISTINCT FROM NEW."variantId" THEN RAISE EXCEPTION 'option_session_option_immutable' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fastt_option_preparation_session_context ON "ProviderOptionPreparationSession";
CREATE TRIGGER fastt_option_preparation_session_context BEFORE INSERT OR UPDATE ON "ProviderOptionPreparationSession"
 FOR EACH ROW EXECUTE FUNCTION fastt_validate_option_preparation_session();
