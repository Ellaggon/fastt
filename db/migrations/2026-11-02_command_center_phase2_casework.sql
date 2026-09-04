-- Phase 2: canonical casework. Existing provider compliance tables remain sources of truth.
CREATE TABLE IF NOT EXISTS "CompliancePolicySet" (
  "id" text PRIMARY KEY, "key" text NOT NULL UNIQUE, "label" text NOT NULL,
  "country" text NOT NULL, "vertical" text NOT NULL, "collectionModel" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','retired')),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "CompliancePolicyVersion" (
  "id" text PRIMARY KEY, "policySetId" text NOT NULL REFERENCES "CompliancePolicySet"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL, "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','published','retired')),
  "effectiveFrom" timestamptz NOT NULL, "effectiveTo" timestamptz, "approvedBy" text REFERENCES "User"("id"), "approvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("policySetId","version")
);
CREATE INDEX IF NOT EXISTS "CompliancePolicyVersion_active_idx" ON "CompliancePolicyVersion" ("policySetId","status","effectiveFrom");
CREATE TABLE IF NOT EXISTS "ComplianceRequirementRule" (
  "id" text PRIMARY KEY, "policyVersionId" text NOT NULL REFERENCES "CompliancePolicyVersion"("id") ON DELETE RESTRICT,
  "domain" text NOT NULL CHECK ("domain" IN ('verification','fiscal','documents','payments')), "requirementKey" text NOT NULL,
  "required" boolean NOT NULL DEFAULT true, "conditionJson" jsonb, "slaHours" integer NOT NULL DEFAULT 48 CHECK ("slaHours" BETWEEN 1 AND 168),
  "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("policyVersionId","requirementKey")
);
CREATE TABLE IF NOT EXISTS "ComplianceDecisionReason" (
  "id" text PRIMARY KEY, "policyVersionId" text NOT NULL REFERENCES "CompliancePolicyVersion"("id") ON DELETE RESTRICT,
  "code" text NOT NULL, "domain" text, "decision" text NOT NULL CHECK ("decision" IN ('approved','rejected','requires_attention','request_information')),
  "label" text NOT NULL, "requiresComment" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("policyVersionId","code"),
  CHECK ("domain" IS NULL OR "domain" IN ('verification','fiscal','documents','payments'))
);
CREATE TABLE IF NOT EXISTS "ComplianceCase" (
  "id" text PRIMARY KEY, "caseNumber" text NOT NULL UNIQUE, "providerId" text NOT NULL REFERENCES "Provider"("id"),
  "caseType" text NOT NULL DEFAULT 'provider_compliance', "domain" text NOT NULL CHECK ("domain" IN ('verification','fiscal','documents','payments')),
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','in_review','waiting_information','blocked','resolved','closed','canceled')),
  "stage" text NOT NULL DEFAULT 'triage', "priority" text NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low','normal','high','critical')),
  "riskTier" text NOT NULL DEFAULT 'standard' CHECK ("riskTier" IN ('standard','elevated','high')),
  "sourceType" text NOT NULL, "sourceRef" text NOT NULL, "policyVersionId" text REFERENCES "CompliancePolicyVersion"("id"),
  "summary" text, "resolutionCode" text, "openedAt" timestamptz NOT NULL DEFAULT now(), "resolvedAt" timestamptz, "closedAt" timestamptz, "reopenedAt" timestamptz,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" >= 1), "createdBy" text REFERENCES "User"("id"),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ComplianceCase_status_priority_opened_idx" ON "ComplianceCase" ("status","priority","openedAt");
CREATE INDEX IF NOT EXISTS "ComplianceCase_provider_status_idx" ON "ComplianceCase" ("providerId","status");
CREATE INDEX IF NOT EXISTS "ComplianceCase_domain_status_priority_idx" ON "ComplianceCase" ("domain","status","priority");
CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceCase_active_source_unique" ON "ComplianceCase" ("providerId","domain","sourceType","sourceRef") WHERE "status" IN ('open','in_review','waiting_information','blocked');
CREATE TABLE IF NOT EXISTS "CaseTask" (
  "id" text PRIMARY KEY, "caseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT, "taskKey" text NOT NULL,
  "taskType" text NOT NULL DEFAULT 'review_requirement', "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','in_progress','blocked','completed','canceled')),
  "requirementKey" text, "assigneeEmail" text, "dueAt" timestamptz, "completedAt" timestamptz, "blockedReasonCode" text,
  "version" integer NOT NULL DEFAULT 1, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("caseId","taskKey")
);
CREATE INDEX IF NOT EXISTS "CaseTask_status_due_idx" ON "CaseTask" ("status","dueAt");
CREATE TABLE IF NOT EXISTS "CaseAssignmentEvent" (
  "id" text PRIMARY KEY, "caseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT, "taskId" text REFERENCES "CaseTask"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL CHECK ("eventType" IN ('assigned','reassigned','unassigned','backfilled')), "fromAssigneeEmail" text, "toAssigneeEmail" text,
  "reasonCode" text, "actorUserId" text REFERENCES "User"("id"), "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CaseAssignmentEvent_case_created_idx" ON "CaseAssignmentEvent" ("caseId","createdAt");
CREATE TABLE IF NOT EXISTS "CaseSlaTimer" (
  "id" text PRIMARY KEY, "caseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT, "timerKey" text NOT NULL DEFAULT 'resolution', "policyKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'running' CHECK ("status" IN ('running','paused','breached','stopped')), "startedAt" timestamptz NOT NULL DEFAULT now(), "dueAt" timestamptz NOT NULL,
  "pausedAt" timestamptz, "breachedAt" timestamptz, "stoppedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("caseId","timerKey")
);
CREATE INDEX IF NOT EXISTS "CaseSlaTimer_due_running_idx" ON "CaseSlaTimer" ("dueAt","status");
CREATE TABLE IF NOT EXISTS "CaseLink" (
  "id" text PRIMARY KEY, "fromCaseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT, "toCaseId" text NOT NULL REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT,
  "linkType" text NOT NULL CHECK ("linkType" IN ('duplicate','reverification','appeal','related_incident')), "createdBy" text REFERENCES "User"("id"), "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("fromCaseId","toCaseId","linkType"), CHECK ("fromCaseId" <> "toCaseId")
);
CREATE TABLE IF NOT EXISTS "DomainEventOutbox" (
  "id" text PRIMARY KEY, "eventType" text NOT NULL, "aggregateType" text NOT NULL, "aggregateId" text NOT NULL, "dedupeKey" text NOT NULL UNIQUE,
  "payloadJson" jsonb NOT NULL, "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','processing','published','failed')),
  "attempts" integer NOT NULL DEFAULT 0, "availableAt" timestamptz NOT NULL DEFAULT now(), "lockedAt" timestamptz, "lockedBy" text, "publishedAt" timestamptz, "lastError" text, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "DomainEventOutbox_pending_idx" ON "DomainEventOutbox" ("status","availableAt","createdAt") WHERE "status" = 'pending';

-- Keep identical to src/shared/infrastructure/db/schema/casework-policy-seed.sql
-- Deterministic Phase 2 policy seed for Bolivia accommodation intermediary/PSP.
-- Included in fresh installs via db:pg:generate-initial and in upgrades via the
-- Phase 2 additive migration. Keep both copies identical and idempotent.
INSERT INTO "CompliancePolicySet" ("id","key","label","country","vertical","collectionModel","status") VALUES
	('cps_bo_accommodation_intermediary_v1','bo-accommodation-intermediary','FASTT Bolivia · alojamientos · intermediario','BO','accommodation','intermediary','active')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "CompliancePolicyVersion" ("id","policySetId","version","status","effectiveFrom","approvedAt") VALUES
	('cpv_bo_accommodation_intermediary_v1','cps_bo_accommodation_intermediary_v1',1,'published','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
ON CONFLICT ("policySetId","version") DO NOTHING;

INSERT INTO "ComplianceRequirementRule" ("id","policyVersionId","domain","requirementKey","slaHours") VALUES
	('crr_v1_identity','cpv_bo_accommodation_intermediary_v1','verification','identity_and_business_review',24),
	('crr_v1_tax','cpv_bo_accommodation_intermediary_v1','fiscal','tax_identity_review',48),
	('crr_v1_document','cpv_bo_accommodation_intermediary_v1','documents','evidence_document_review',48),
	('crr_v1_payout','cpv_bo_accommodation_intermediary_v1','payments','payout_account_review',24)
ON CONFLICT ("policyVersionId","requirementKey") DO NOTHING;

INSERT INTO "ComplianceDecisionReason" ("id","policyVersionId","code","domain","decision","label","requiresComment") VALUES
	('cdr_v1_approved','cpv_bo_accommodation_intermediary_v1','requirements_satisfied',NULL,'approved','Requisitos satisfechos',false),
	('cdr_v1_missing','cpv_bo_accommodation_intermediary_v1','evidence_missing',NULL,'request_information','Evidencia faltante',true),
	('cdr_v1_mismatch','cpv_bo_accommodation_intermediary_v1','information_mismatch',NULL,'requires_attention','Información inconsistente',true),
	('cdr_v1_rejected','cpv_bo_accommodation_intermediary_v1','requirements_not_satisfied',NULL,'rejected','Requisitos no satisfechos',true)
ON CONFLICT ("policyVersionId","code") DO NOTHING;
