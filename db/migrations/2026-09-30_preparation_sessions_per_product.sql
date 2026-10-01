ALTER TABLE "ProviderPreparationSession" ADD COLUMN IF NOT EXISTS "writeVersion" integer NOT NULL DEFAULT 1;
-- Existing rows keep their IDs, timestamps and saved context. Null-product legacy rows
-- remain available for audit; they are not assigned to another product.
DROP INDEX IF EXISTS "ProviderPreparationSession_owner_playbook_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderPreparationSession_owner_product_playbook_unique"
 ON "ProviderPreparationSession" ("providerId", "userId", "productId", "playbookId");

CREATE OR REPLACE FUNCTION fastt_validate_preparation_session() RETURNS trigger AS $$
BEGIN
 IF NEW."writeVersion" <> 2 THEN RAISE EXCEPTION 'preparation_session_client_upgrade_required' USING ERRCODE = '23514'; END IF;
 IF TG_OP = 'UPDATE' AND (OLD."providerId", OLD."userId", OLD."productId", OLD."playbookId")
   IS DISTINCT FROM (NEW."providerId", NEW."userId", NEW."productId", NEW."playbookId") THEN
  RAISE EXCEPTION 'preparation_session_identity_immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW."productId" IS NULL OR NOT EXISTS (
  SELECT 1 FROM "Product" p WHERE p.id = NEW."productId" AND p."providerId" = NEW."providerId"
   AND ((lower(p."productType") = 'tour' AND NEW.vertical = 'tour' AND NEW."playbookId" IN ('launch-tour', 'complete-to-publish'))
     OR (lower(p."productType") IN ('hotel','whole_home') AND NEW.vertical = 'hotel' AND NEW."playbookId" IN ('launch','complete-to-publish')))
 ) THEN RAISE EXCEPTION 'preparation_session_product_invalid' USING ERRCODE = '23514'; END IF;
 IF NEW."variantId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Variant" v WHERE v.id = NEW."variantId" AND v."productId" = NEW."productId"
 ) THEN RAISE EXCEPTION 'preparation_session_variant_invalid' USING ERRCODE = '23514'; END IF;
 IF NEW."ratePlanId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "RatePlan" r WHERE r.id = NEW."ratePlanId" AND r."variantId" = NEW."variantId"
 ) THEN RAISE EXCEPTION 'preparation_session_rate_invalid' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fastt_preparation_session_context ON "ProviderPreparationSession";
CREATE TRIGGER fastt_preparation_session_context BEFORE INSERT OR UPDATE ON "ProviderPreparationSession"
 FOR EACH ROW EXECUTE FUNCTION fastt_validate_preparation_session();
