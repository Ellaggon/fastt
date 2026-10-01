-- Require the v2 transaction marker even when an old writer updates a v2 row.
CREATE OR REPLACE FUNCTION fastt_validate_preparation_session() RETURNS trigger AS $$
BEGIN
 IF current_setting('fastt.preparation_write_version', true) IS DISTINCT FROM '2' OR NEW."writeVersion" <> 2 THEN RAISE EXCEPTION 'preparation_session_client_upgrade_required' USING ERRCODE = '23514'; END IF;
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
