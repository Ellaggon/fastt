-- Preserve the publication barrier while accepting the versioned evidence
-- packages and rule-free admission policies used by the composition contract.
CREATE OR REPLACE FUNCTION fastt_validate_commercial_tour_policy_publish()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_vertical text;
  target_scope text;
  rule_record record;
  evidence jsonb;
  alternative jsonb;
  part jsonb;
  field_name text;
BEGIN
  IF NEW."status" <> 'published' THEN RETURN NEW; END IF;
  SELECT "vertical", "policyScope" INTO target_vertical, target_scope
    FROM "CompliancePolicySet" WHERE "id" = NEW."policySetId";
  IF target_vertical <> 'tour' OR target_scope <> 'commercial' THEN RETURN NEW; END IF;
  IF NEW."approvedBy" IS NULL OR NEW."approvedAt" IS NULL
    OR COALESCE(btrim(NEW."approvalReference"), '') = '' THEN
    RAISE EXCEPTION 'commercial_tour_policy_approval_metadata_missing';
  END IF;
  IF jsonb_typeof(NEW."contextJson") IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'commercial_tour_policy_context_incomplete';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['operatingRoles', 'activityClasses', 'jurisdictionCodes'] LOOP
    IF jsonb_typeof(NEW."contextJson"->field_name) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'commercial_tour_policy_context_incomplete';
    END IF;
    IF jsonb_array_length(NEW."contextJson"->field_name) = 0 THEN
      RAISE EXCEPTION 'commercial_tour_policy_context_incomplete';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT "approvalArea") FROM "CommercialPolicyApproval"
      WHERE "policyVersionId" = NEW."id"
        AND COALESCE(btrim("approvalReference"), '') <> '') <> 3 THEN
    RAISE EXCEPTION 'commercial_tour_policy_signatures_incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ComplianceRequirementRule" WHERE "policyVersionId" = NEW."id")
    AND (NEW."contextJson"->>'contextVersion' = '3'
      AND NEW."contextJson"->'composition'->>'kind' = 'admission') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
  END IF;
  FOR rule_record IN SELECT * FROM "ComplianceRequirementRule"
    WHERE "policyVersionId" = NEW."id" AND "required" = true LOOP
    IF jsonb_typeof(rule_record."capabilitiesJson") IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
    END IF;
    IF jsonb_array_length(rule_record."capabilitiesJson") = 0
      OR COALESCE(btrim(rule_record."reviewOwner"), '') = ''
      OR COALESCE(btrim(rule_record."blockingAction"), '') = ''
      OR rule_record."sourceKind" IS NULL
      OR COALESCE(btrim(rule_record."sourceReference"), '') = ''
      OR rule_record."sourceCheckedAt" IS NULL THEN
      RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
    END IF;
    evidence := rule_record."acceptedEvidenceJson";
    IF jsonb_typeof(evidence) = 'array' THEN
      IF jsonb_array_length(evidence) = 0 THEN
        RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
      END IF;
    ELSIF jsonb_typeof(evidence) = 'object' THEN
      IF evidence->>'version' IS DISTINCT FROM '1'
        OR jsonb_typeof(evidence->'alternatives') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
      END IF;
      IF jsonb_array_length(evidence->'alternatives') NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
      END IF;
      FOR alternative IN SELECT * FROM jsonb_array_elements(evidence->'alternatives') LOOP
        IF jsonb_typeof(alternative->'allOf') IS DISTINCT FROM 'array'
          OR COALESCE(btrim(alternative->>'id'), '') = '' THEN
          RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
        END IF;
        IF jsonb_array_length(alternative->'allOf') NOT BETWEEN 1 AND 20 THEN
          RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
        END IF;
        FOR part IN SELECT * FROM jsonb_array_elements(alternative->'allOf') LOOP
          IF NOT EXISTS (SELECT 1 FROM "DocumentDefinitionVersion"
            WHERE "id" = part->>'definitionVersionId' AND "status" = 'published') THEN
            RAISE EXCEPTION 'policy_evidence_definition_not_published';
          END IF;
        END LOOP;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_CompliancePolicyVersion_commercial_tour_publish" ON "CompliancePolicyVersion";
CREATE TRIGGER "trg_CompliancePolicyVersion_commercial_tour_publish"
  BEFORE INSERT OR UPDATE OF "status", "contextJson", "approvedBy", "approvedAt", "approvalReference"
  ON "CompliancePolicyVersion"
  FOR EACH ROW EXECUTE FUNCTION fastt_validate_commercial_tour_policy_publish();
