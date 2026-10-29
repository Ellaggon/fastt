CREATE OR REPLACE FUNCTION fastt_validate_operating_territories() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids jsonb; place_id text; matched text;
BEGIN
  ids := NEW."jurisdictionCodes";
  IF ids IS NULL THEN
    IF NEW."jurisdictionCode" IS NOT NULL THEN RAISE EXCEPTION 'territory_projection_mismatch'; END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(ids) <> 'array' OR jsonb_array_length(ids) NOT BETWEEN 1 AND 100
    OR (SELECT count(*) FROM jsonb_array_elements(ids)) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements(ids)) THEN
    RAISE EXCEPTION 'invalid_operating_territories';
  END IF;
  FOR place_id IN SELECT jsonb_array_elements_text(ids) LOOP
    SELECT id INTO matched FROM "GeoPlace" WHERE id = place_id FOR KEY SHARE;
    IF matched IS NULL THEN RAISE EXCEPTION 'unknown_operating_territory: %', place_id; END IF;
  END LOOP;
  IF NEW."jurisdictionCode" IS DISTINCT FROM ids->>0 THEN RAISE EXCEPTION 'territory_projection_mismatch'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "TourComplianceContext_geography_guard" ON "TourComplianceContext";
CREATE TRIGGER "TourComplianceContext_geography_guard" BEFORE INSERT OR UPDATE OF "jurisdictionCodes", "jurisdictionCode"
ON "TourComplianceContext" FOR EACH ROW EXECUTE FUNCTION fastt_validate_operating_territories();

CREATE OR REPLACE FUNCTION fastt_restrict_operating_place_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TourComplianceContext" WHERE "jurisdictionCodes" ? OLD.id) THEN
    RAISE EXCEPTION 'GeoPlace is referenced by an operating declaration';
  END IF;
  IF EXISTS (SELECT 1 FROM "CompliancePolicyVersion" v
    WHERE v."contextJson"->'jurisdictionCodes' ? OLD.id
      OR EXISTS (SELECT 1 FROM "GeoPlaceExternalId" e WHERE e."placeId" = OLD.id
        AND e.source = 'fastt_legacy_jurisdiction' AND v."contextJson"->'jurisdictionCodes' ? e."externalId"))
    OR EXISTS (SELECT 1 FROM "ComplianceRequirementRule" r WHERE r."conditionJson"->'jurisdictionCodes' ? OLD.id) THEN
    RAISE EXCEPTION 'GeoPlace is referenced by a commercial policy';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS "GeoPlace_operating_reference_guard" ON "GeoPlace";
CREATE TRIGGER "GeoPlace_operating_reference_guard" BEFORE DELETE ON "GeoPlace"
FOR EACH ROW EXECUTE FUNCTION fastt_restrict_operating_place_delete();
CREATE INDEX IF NOT EXISTS "TourComplianceContext_jurisdictionCodes_gin_idx" ON "TourComplianceContext" USING gin ("jurisdictionCodes");

CREATE OR REPLACE FUNCTION fastt_validate_policy_territories() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids jsonb; place_id text; country text; matched text;
BEGIN
  IF TG_TABLE_NAME = 'CompliancePolicyVersion' THEN
    ids := NEW."contextJson"->'jurisdictionCodes';
    SELECT s.country INTO country FROM "CompliancePolicySet" s WHERE s.id = NEW."policySetId";
  ELSE
    ids := NEW."conditionJson"->'jurisdictionCodes';
    SELECT s.country INTO country FROM "CompliancePolicySet" s JOIN "CompliancePolicyVersion" v ON v."policySetId" = s.id WHERE v.id = NEW."policyVersionId";
  END IF;
  IF ids IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(ids) <> 'array' OR jsonb_array_length(ids) > 100 THEN RAISE EXCEPTION 'invalid_policy_territories'; END IF;
  FOR place_id IN SELECT jsonb_array_elements_text(ids) LOOP
    SELECT g.id INTO matched
    FROM "GeoPlace" g
    WHERE g."countryCode" = country AND g.status = 'active'
      AND (
        g.id = place_id
        OR EXISTS (
          SELECT 1 FROM "GeoPlaceExternalId" e
          WHERE e."placeId" = g.id
            AND e.source = 'fastt_legacy_jurisdiction'
            AND e."externalId" = place_id
        )
      )
    FOR KEY SHARE OF g;
    IF matched IS NULL THEN RAISE EXCEPTION 'invalid_policy_territory: %', place_id; END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CompliancePolicyVersion_geography_guard" ON "CompliancePolicyVersion";
CREATE TRIGGER "CompliancePolicyVersion_geography_guard" BEFORE INSERT OR UPDATE OF "contextJson"
ON "CompliancePolicyVersion" FOR EACH ROW EXECUTE FUNCTION fastt_validate_policy_territories();
DROP TRIGGER IF EXISTS "ComplianceRequirementRule_geography_guard" ON "ComplianceRequirementRule";
CREATE TRIGGER "ComplianceRequirementRule_geography_guard" BEFORE INSERT OR UPDATE OF "conditionJson"
ON "ComplianceRequirementRule" FOR EACH ROW EXECUTE FUNCTION fastt_validate_policy_territories();

