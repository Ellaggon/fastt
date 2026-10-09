CREATE OR REPLACE FUNCTION fastt_validate_schedule_creation_intent() RETURNS trigger AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD."creationIntent" IS NOT NULL THEN
  IF OLD."creationIntent"->>'sourceVariantId' IS DISTINCT FROM NEW."creationIntent"->>'sourceVariantId'
    OR OLD."creationIntent"->>'mode' IS DISTINCT FROM NEW."creationIntent"->>'mode'
    OR (OLD."variantId" IS NOT NULL AND OLD."creationIntent" IS DISTINCT FROM NEW."creationIntent") THEN
   RAISE EXCEPTION 'schedule_creation_intent_immutable' USING ERRCODE = '23514';
  END IF;
 END IF;
 IF NEW."creationIntent" IS NOT NULL THEN
  IF NEW."creationIntent"->>'mode' IS DISTINCT FROM 'schedule' OR NOT EXISTS (
   SELECT 1 FROM "Variant" v JOIN "Product" p ON p.id = v."productId"
   WHERE v.id = NEW."creationIntent"->>'sourceVariantId' AND p.id = NEW."productId"
     AND p."providerId" = NEW."providerId" AND v.kind = 'tour_slot' AND lower(p."productType") = 'tour'
  ) THEN RAISE EXCEPTION 'schedule_creation_source_invalid' USING ERRCODE = '23514'; END IF;
  IF NEW."creationIntent"->>'sourceRatePlanId' IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "RatePlan" r WHERE r.id = NEW."creationIntent"->>'sourceRatePlanId'
    AND r."variantId" = NEW."creationIntent"->>'sourceVariantId'
  ) THEN RAISE EXCEPTION 'schedule_creation_rate_invalid' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fastt_schedule_creation_intent ON "ProviderOptionPreparationSession";
CREATE TRIGGER fastt_schedule_creation_intent BEFORE INSERT OR UPDATE ON "ProviderOptionPreparationSession"
 FOR EACH ROW EXECUTE FUNCTION fastt_validate_schedule_creation_intent();
