-- Exact historical correspondences, not name-based or inferred legal coverage.
CREATE TEMP TABLE operating_territory_map (code text PRIMARY KEY, place_id text NOT NULL) ON COMMIT DROP;
INSERT INTO operating_territory_map VALUES
('BO', 'geo:bo'), ('BO-BN', 'geo:bo:beni'), ('BO-CH', 'geo:bo:chuquisaca'),
('BO-CB', 'geo:bo:cochabamba'), ('BO-LP', 'geo:bo:la-paz-department'),
('BO-OR', 'geo:bo:oruro'), ('BO-PN', 'geo:bo:pando'), ('BO-PT', 'geo:bo:potosi'),
('BO-SC', 'geo:bo:santa-cruz'), ('BO-TJ', 'geo:bo:tarija');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM operating_territory_map m LEFT JOIN "GeoPlace" g ON g.id = m.place_id
    WHERE g.id IS NULL OR g."countryCode" <> 'BO' OR g.status <> 'active'
      OR g."placeType" <> CASE WHEN m.code = 'BO' THEN 'country' ELSE 'admin_area_1' END) THEN
    RAISE EXCEPTION 'Canonical Bolivia catalogue is missing or incompatible; seed/review geography first';
  END IF;
END $$;

INSERT INTO "GeoPlaceExternalId" (id, "placeId", source, "externalId", "createdAt", "updatedAt")
SELECT 'legacy-jurisdiction:' || code, place_id, 'fastt_legacy_jurisdiction', code, now(), now()
FROM operating_territory_map
ON CONFLICT (source, "externalId") DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM operating_territory_map m JOIN "GeoPlaceExternalId" e
    ON e.source = 'fastt_legacy_jurisdiction' AND e."externalId" = m.code WHERE e."placeId" <> m.place_id) THEN
    RAISE EXCEPTION 'Conflicting historical territory correspondence';
  END IF;
END $$;

ALTER TABLE "TourComplianceContext" DROP CONSTRAINT IF EXISTS "TourComplianceContext_territories_check";
UPDATE "TourComplianceContext" c SET "jurisdictionCodes" = (
  SELECT jsonb_agg(id ORDER BY position) FROM (
    SELECT coalesce(m.place_id, value) AS id, min(ordinality) AS position
    FROM jsonb_array_elements_text(coalesce(c."jurisdictionCodes", jsonb_build_array(c."jurisdictionCode"))) WITH ORDINALITY v(value, ordinality)
    LEFT JOIN operating_territory_map m ON m.code = v.value WHERE value IS NOT NULL GROUP BY coalesce(m.place_id, value)
  ) canonical
) WHERE c."jurisdictionCodes" IS NOT NULL OR c."jurisdictionCode" IS NOT NULL;
UPDATE "TourComplianceContext" SET "jurisdictionCode" = "jurisdictionCodes"->>0;
UPDATE "ProviderDocumentScope" s SET "territoryCode" = m.place_id
FROM operating_territory_map m WHERE s."territoryCode" = m.code;

-- Signed policy payloads and document labels stay immutable. Their historical
-- IDs resolve through GeoPlaceExternalId at the read boundary.
ALTER TABLE "TourComplianceContext" ADD CONSTRAINT "TourComplianceContext_territories_check"
CHECK ("jurisdictionCodes" IS NULL OR (jsonb_typeof("jurisdictionCodes") = 'array' AND jsonb_array_length("jurisdictionCodes") BETWEEN 1 AND 100));
ALTER TABLE "ProviderDocumentScope" DROP CONSTRAINT IF EXISTS "ProviderDocumentScope_territoryCode_fk";
ALTER TABLE "ProviderDocumentScope" ADD CONSTRAINT "ProviderDocumentScope_territoryCode_fk"
FOREIGN KEY ("territoryCode") REFERENCES "GeoPlace"(id);

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


-- Validate old rows as well; triggers only validate subsequent writes.
UPDATE "TourComplianceContext" SET "jurisdictionCodes" = "jurisdictionCodes";
