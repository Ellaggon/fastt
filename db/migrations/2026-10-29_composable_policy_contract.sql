CREATE OR REPLACE FUNCTION fastt_guard_experience_policy_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('published', 'retired') AND NEW."contextJson" IS DISTINCT FROM OLD."contextJson" THEN
    RAISE EXCEPTION 'approved_policy_context_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('published', 'retired') AND NEW."status" NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'approved_policy_status_downgrade_forbidden';
  END IF;
  IF NEW."contextJson" ? 'experienceFormats' AND COALESCE(NEW."contextJson"->>'contextVersion', '') NOT IN ('2', '3') THEN
    RAISE EXCEPTION 'experience_policy_context_version_required';
  END IF;
  IF NEW."contextJson" ? 'contextVersion' THEN
    IF (NEW."contextJson"->>'contextVersion') IS NULL OR (NEW."contextJson"->>'contextVersion') NOT IN ('1', '2', '3') THEN
      RAISE EXCEPTION 'experience_policy_context_version_invalid';
    END IF;
  ELSIF NEW."contextJson" ? 'experienceFormats' THEN
    RAISE EXCEPTION 'experience_policy_context_version_required';
  END IF;
  IF NEW."contextJson"->>'contextVersion' IN ('2', '3') THEN
    IF jsonb_typeof(NEW."contextJson"->'experienceFormats') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'experience_policy_formats_missing';
    END IF;
    IF jsonb_array_length(NEW."contextJson"->'experienceFormats') = 0 THEN
      RAISE EXCEPTION 'experience_policy_formats_missing';
    END IF;
    FOR entry IN SELECT * FROM jsonb_array_elements(NEW."contextJson"->'experienceFormats') LOOP
      IF entry NOT IN ('"guided_tour"'::jsonb, '"workshop"'::jsonb, '"class"'::jsonb, '"tasting"'::jsonb) THEN
        RAISE EXCEPTION 'experience_policy_format_invalid';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_guard_policy_composition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c jsonb; target_id text; target_context jsonb; source_set "CompliancePolicySet"%ROWTYPE; target_set "CompliancePolicySet"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "CompliancePolicySet" s WHERE s.id = OLD."policySetId" AND s."policyScope" = 'commercial')
      AND (OLD.status IN ('published','retired') OR EXISTS (SELECT 1 FROM "CommercialPolicyApproval" a WHERE a."policyVersionId" = OLD.id)) THEN
      RAISE EXCEPTION 'signed_policy_contract_immutable';
    END IF;
    IF EXISTS (SELECT 1 FROM "CompliancePolicyVersion" v WHERE v."contextJson"->'composition'->'replacesVersionIds' @> jsonb_build_array(OLD.id)) THEN
      RAISE EXCEPTION 'referenced_policy_version_delete_forbidden';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM "CommercialPolicyApproval" a WHERE a."policyVersionId" = OLD.id) AND
    (NEW."contextJson", NEW."effectiveFrom", NEW."effectiveTo", NEW."policySetId") IS DISTINCT FROM
    (OLD."contextJson", OLD."effectiveFrom", OLD."effectiveTo", OLD."policySetId") THEN
    RAISE EXCEPTION 'signed_policy_contract_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'retired' AND NEW.status <> 'retired' THEN RAISE EXCEPTION 'retired_policy_reactivation_forbidden'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status = 'retired'
    AND COALESCE(jsonb_array_length(OLD."contextJson"->'composition'->'replacesVersionIds'),0) > 0
    AND NOT EXISTS (SELECT 1 FROM "CompliancePolicyVersion" v WHERE v.status = 'published' AND v."effectiveFrom" <= now() AND (v."effectiveTo" IS NULL OR v."effectiveTo" > now()) AND v."contextJson"->'composition'->'replacesVersionIds' @> jsonb_build_array(OLD.id)) THEN
    RAISE EXCEPTION 'policy_successor_retirement_requires_replacement';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."contextJson" IS NOT DISTINCT FROM OLD."contextJson" THEN RETURN NEW; END IF;
  IF NEW."contextJson"->>'contextVersion' IS DISTINCT FROM '3' THEN RETURN NEW; END IF;
  c := NEW."contextJson"->'composition';
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR COALESCE(c->>'kind','') NOT IN ('admission','requirements')
    OR COALESCE(c->>'family','') NOT IN ('identity','fiscal','tourism','specialized_activity','regulated_place','operational_resources','platform_standards')
    OR jsonb_typeof(c->'requiredFamilies') IS DISTINCT FROM 'array' OR jsonb_typeof(c->'replacesVersionIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_policy_composition';
  END IF;
  IF c - ARRAY['kind','family','requiredFamilies','replacesVersionIds'] <> '{}'::jsonb THEN RAISE EXCEPTION 'invalid_policy_composition'; END IF;
  IF (c->>'kind' = 'admission' AND jsonb_array_length(c->'requiredFamilies') = 0)
    OR (c->>'kind' = 'requirements' AND jsonb_array_length(c->'requiredFamilies') <> 0)
    OR jsonb_array_length(c->'requiredFamilies') > 7 OR jsonb_array_length(c->'replacesVersionIds') > 50
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(c->'requiredFamilies') f WHERE f NOT IN ('identity','fiscal','tourism','specialized_activity','regulated_place','operational_resources','platform_standards'))
    OR (SELECT count(*) <> count(DISTINCT v) FROM jsonb_array_elements_text(c->'replacesVersionIds') v) THEN
    RAISE EXCEPTION 'invalid_policy_composition';
  END IF;
  SELECT * INTO source_set FROM "CompliancePolicySet" WHERE id = NEW."policySetId";
  FOR target_id IN SELECT jsonb_array_elements_text(c->'replacesVersionIds') LOOP
    IF target_id = NEW.id THEN RAISE EXCEPTION 'invalid_policy_replacement'; END IF;
    SELECT v."contextJson" INTO target_context FROM "CompliancePolicyVersion" v WHERE v.id = target_id AND v.status = 'published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_policy_replacement'; END IF;
    SELECT s.* INTO target_set FROM "CompliancePolicySet" s JOIN "CompliancePolicyVersion" v ON v."policySetId" = s.id WHERE v.id = target_id;
    IF target_context->'composition'->>'family' IS DISTINCT FROM c->>'family'
      OR target_context->'composition'->>'kind' IS DISTINCT FROM c->>'kind'
      OR (source_set.country, source_set.vertical, source_set."holderType", source_set."jurisdictionRole", source_set."collectionModel") IS DISTINCT FROM
         (target_set.country, target_set.vertical, target_set."holderType", target_set."jurisdictionRole", target_set."collectionModel") THEN
      RAISE EXCEPTION 'invalid_policy_replacement';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_policy_composition ON "CompliancePolicyVersion";
CREATE TRIGGER trg_policy_composition BEFORE INSERT OR UPDATE OF "contextJson", "effectiveFrom", "effectiveTo", "policySetId", "status" OR DELETE ON "CompliancePolicyVersion" FOR EACH ROW EXECUTE FUNCTION fastt_guard_policy_composition();

CREATE OR REPLACE FUNCTION fastt_guard_signed_policy_rule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id text; state text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."policyVersionId" IS DISTINCT FROM OLD."policyVersionId" THEN RAISE EXCEPTION 'policy_rule_parent_immutable'; END IF;
  IF TG_OP = 'DELETE' THEN version_id := OLD."policyVersionId"; ELSE version_id := NEW."policyVersionId"; END IF;
  SELECT v.status INTO state FROM "CompliancePolicyVersion" v JOIN "CompliancePolicySet" s ON s.id = v."policySetId" WHERE v.id = version_id AND s."policyScope" = 'commercial' FOR UPDATE OF v;
  IF FOUND AND (state <> 'draft' OR EXISTS (SELECT 1 FROM "CommercialPolicyApproval" a WHERE a."policyVersionId" = version_id)) THEN RAISE EXCEPTION 'signed_policy_rule_immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_signed_policy_rule ON "ComplianceRequirementRule";
CREATE TRIGGER trg_signed_policy_rule BEFORE INSERT OR UPDATE OR DELETE ON "ComplianceRequirementRule" FOR EACH ROW EXECUTE FUNCTION fastt_guard_signed_policy_rule();

CREATE OR REPLACE FUNCTION fastt_guard_signed_policy_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.country, NEW.vertical, NEW."holderType", NEW."collectionModel", NEW."jurisdictionRole", NEW."policyScope") IS DISTINCT FROM
     (OLD.country, OLD.vertical, OLD."holderType", OLD."collectionModel", OLD."jurisdictionRole", OLD."policyScope")
     AND EXISTS (SELECT 1 FROM "CompliancePolicyVersion" v WHERE v."policySetId" = OLD.id AND (v.status <> 'draft' OR EXISTS (SELECT 1 FROM "CommercialPolicyApproval" a WHERE a."policyVersionId" = v.id))) THEN
    RAISE EXCEPTION 'signed_policy_set_immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_signed_policy_set ON "CompliancePolicySet";
CREATE TRIGGER trg_signed_policy_set BEFORE UPDATE ON "CompliancePolicySet" FOR EACH ROW EXECUTE FUNCTION fastt_guard_signed_policy_set();

CREATE OR REPLACE FUNCTION fastt_guard_policy_definition_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' AND NEW.status = 'retired' AND EXISTS (
    SELECT 1 FROM "ComplianceRequirementRule" r JOIN "CompliancePolicyVersion" v ON v.id = r."policyVersionId",
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r."acceptedEvidenceJson") = 'object' THEN r."acceptedEvidenceJson"->'alternatives' ELSE '[]'::jsonb END) a,
      LATERAL jsonb_array_elements(a->'allOf') p
    WHERE v.status = 'published' AND (v."effectiveTo" IS NULL OR v."effectiveTo" > now()) AND p->>'definitionVersionId' = OLD.id
  ) THEN RAISE EXCEPTION 'document_definition_used_by_policy'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_policy_definition_retirement ON "DocumentDefinitionVersion";
CREATE TRIGGER trg_policy_definition_retirement BEFORE UPDATE OF status ON "DocumentDefinitionVersion" FOR EACH ROW EXECUTE FUNCTION fastt_guard_policy_definition_retirement();
