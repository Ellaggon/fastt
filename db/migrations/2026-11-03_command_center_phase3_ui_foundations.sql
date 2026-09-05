-- Phase 3: durable operational UI foundations. Additive and safe for legacy coexistence.
ALTER TABLE "CaseTask"
  ADD COLUMN IF NOT EXISTS "assigneeUserId" text REFERENCES "User"("id") ON DELETE RESTRICT;

UPDATE "CaseTask" task
SET "assigneeUserId" = usr."id"
FROM "User" usr
WHERE task."assigneeUserId" IS NULL
  AND task."assigneeEmail" IS NOT NULL
  AND lower(usr."email") = lower(task."assigneeEmail");

CREATE INDEX IF NOT EXISTS "CaseTask_assignee_user_status_idx"
  ON "CaseTask" ("assigneeUserId", "status");

CREATE TABLE IF NOT EXISTS "CaseDecision" (
  "id" text PRIMARY KEY,
  "caseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT,
  "decision" text NOT NULL CHECK ("decision" IN ('approved','rejected','requires_attention','request_information')),
  "reasonCodeId" text NOT NULL REFERENCES "ComplianceDecisionReason"("id") ON DELETE RESTRICT,
  "policyVersionId" text NOT NULL REFERENCES "CompliancePolicyVersion"("id") ON DELETE RESTRICT,
  "caseVersion" integer NOT NULL CHECK ("caseVersion" >= 1),
  "evidenceSnapshotJson" jsonb,
  "impactSnapshotJson" jsonb,
  "comment" text,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','proposed','pending_approval','approved','rejected','applying','applied','failed','canceled')),
  "proposedByUserId" text NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "proposedAt" timestamptz,
  "appliedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CaseDecision_case_created_idx"
  ON "CaseDecision" ("caseId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CaseDecision_case_version_active_unique"
  ON "CaseDecision" ("caseId", "caseVersion")
  WHERE "status" IN ('proposed','pending_approval','approved','applying','applied');

CREATE TABLE IF NOT EXISTS "CaseDecisionApproval" (
  "id" text PRIMARY KEY,
  "decisionId" text NOT NULL REFERENCES "CaseDecision"("id") ON DELETE RESTRICT,
  "actorUserId" text NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "vote" text NOT NULL CHECK ("vote" IN ('approved','rejected')),
  "reason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("decisionId", "actorUserId")
);

CREATE TABLE IF NOT EXISTS "CaseActivityEvent" (
  "id" text PRIMARY KEY,
  "caseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "actorUserId" text REFERENCES "User"("id") ON DELETE RESTRICT,
  "summary" text NOT NULL,
  "metadataJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CaseActivityEvent_case_created_idx"
  ON "CaseActivityEvent" ("caseId", "createdAt");

CREATE TABLE IF NOT EXISTS "SavedCaseView" (
  "id" text PRIMARY KEY,
  "ownerUserId" text NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'private' CHECK ("scope" IN ('private','team')),
  "filtersJson" jsonb NOT NULL,
  "sortJson" jsonb,
  "visibleColumnsJson" jsonb,
  "isDefault" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("ownerUserId", "name")
);
CREATE INDEX IF NOT EXISTS "SavedCaseView_owner_default_idx"
  ON "SavedCaseView" ("ownerUserId", "isDefault");

-- Prevent self-approval at the persistence boundary as well as in application code.
CREATE OR REPLACE FUNCTION fastt_prevent_case_decision_self_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CaseDecision" decision
    WHERE decision."id" = NEW."decisionId"
      AND decision."proposedByUserId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION 'maker_checker_separation_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CaseDecisionApproval_prevent_self_approval" ON "CaseDecisionApproval";
CREATE TRIGGER "CaseDecisionApproval_prevent_self_approval"
BEFORE INSERT OR UPDATE ON "CaseDecisionApproval"
FOR EACH ROW EXECUTE FUNCTION fastt_prevent_case_decision_self_approval();
