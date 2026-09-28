-- A published commercial tour policy represents a reviewed operational tuple,
-- not a generic vertical. Keep each required approval and each rule source
-- independently auditable.

ALTER TABLE "CompliancePolicyVersion"
  ADD COLUMN IF NOT EXISTS "contextJson" jsonb;

ALTER TABLE "ComplianceRequirementRule"
  ADD COLUMN IF NOT EXISTS "sourceKind" text,
  ADD COLUMN IF NOT EXISTS "sourceReference" text,
  ADD COLUMN IF NOT EXISTS "sourceCheckedAt" timestamptz;

DO $$ BEGIN
  ALTER TABLE "ComplianceRequirementRule"
    ADD CONSTRAINT "ComplianceRequirementRule_source_kind_check"
    CHECK ("sourceKind" IS NULL OR "sourceKind" IN ('legal', 'contract', 'fastt_policy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CommercialPolicyApproval" (
  "id" text PRIMARY KEY,
  "policyVersionId" text NOT NULL REFERENCES "CompliancePolicyVersion"("id") ON DELETE RESTRICT,
  "approvalArea" text NOT NULL,
  "approverUserId" text NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "approvalReference" text NOT NULL,
  "approvedAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CommercialPolicyApproval_area_check"
    CHECK ("approvalArea" IN ('policy', 'finance', 'tour_operations')),
  CONSTRAINT "CommercialPolicyApproval_version_area_unique"
    UNIQUE ("policyVersionId", "approvalArea"),
  CONSTRAINT "CommercialPolicyApproval_version_approver_unique"
    UNIQUE ("policyVersionId", "approverUserId")
);

CREATE INDEX IF NOT EXISTS "CommercialPolicyApproval_version_idx"
  ON "CommercialPolicyApproval" ("policyVersionId", "approvedAt");

-- The application validates the same contract for actionable errors. This
-- trigger is the final protection against an ad-hoc SQL update publishing a
-- generic or unsigned tour policy.
CREATE OR REPLACE FUNCTION fastt_validate_commercial_tour_policy_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_vertical text;
  target_scope text;
BEGIN
  IF NEW."status" <> 'published' THEN RETURN NEW; END IF;

  SELECT "vertical", "policyScope"
    INTO target_vertical, target_scope
    FROM "CompliancePolicySet"
   WHERE "id" = NEW."policySetId";
  IF target_vertical <> 'tour' OR target_scope <> 'commercial' THEN RETURN NEW; END IF;

  IF NEW."approvedBy" IS NULL OR NEW."approvedAt" IS NULL OR COALESCE(btrim(NEW."approvalReference"), '') = '' THEN
    RAISE EXCEPTION 'commercial_tour_policy_approval_metadata_missing';
  END IF;
  IF NEW."contextJson" IS NULL
    OR jsonb_typeof(NEW."contextJson") <> 'object'
    OR jsonb_array_length(COALESCE(NEW."contextJson"->'operatingRoles', '[]'::jsonb)) = 0
    OR jsonb_array_length(COALESCE(NEW."contextJson"->'activityClasses', '[]'::jsonb)) = 0
    OR jsonb_array_length(COALESCE(NEW."contextJson"->'jurisdictionCodes', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'commercial_tour_policy_context_incomplete';
  END IF;
  IF (SELECT count(DISTINCT "approvalArea") FROM "CommercialPolicyApproval"
      WHERE "policyVersionId" = NEW."id"
        AND COALESCE(btrim("approvalReference"), '') <> '') <> 3 THEN
    RAISE EXCEPTION 'commercial_tour_policy_signatures_incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ComplianceRequirementRule" WHERE "policyVersionId" = NEW."id")
    OR EXISTS (
      SELECT 1 FROM "ComplianceRequirementRule"
       WHERE "policyVersionId" = NEW."id" AND "required" = true
         AND (
           COALESCE(jsonb_array_length("capabilitiesJson"), 0) = 0
           OR COALESCE(jsonb_array_length("acceptedEvidenceJson"), 0) = 0
           OR COALESCE(btrim("reviewOwner"), '') = ''
           OR COALESCE(btrim("blockingAction"), '') = ''
           OR "sourceKind" IS NULL
           OR COALESCE(btrim("sourceReference"), '') = ''
           OR "sourceCheckedAt" IS NULL
         )
    ) THEN
    RAISE EXCEPTION 'commercial_tour_policy_requirement_contract_incomplete';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_CompliancePolicyVersion_commercial_tour_publish" ON "CompliancePolicyVersion";
CREATE TRIGGER "trg_CompliancePolicyVersion_commercial_tour_publish"
  BEFORE INSERT OR UPDATE OF "status", "contextJson", "approvedBy", "approvedAt", "approvalReference"
  ON "CompliancePolicyVersion"
  FOR EACH ROW EXECUTE FUNCTION fastt_validate_commercial_tour_policy_publish();
