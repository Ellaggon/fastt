-- Fastt Backup may have the core provider schema without the newer casework tables.
-- Establish the shared versioned contract without seeding or publishing any policy.
CREATE TABLE IF NOT EXISTS "CompliancePolicySet" (
	"id" text PRIMARY KEY, "key" text NOT NULL UNIQUE, "label" text NOT NULL,
	"country" text NOT NULL, "vertical" text NOT NULL, "collectionModel" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','retired')),
	"createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "CompliancePolicyVersion" (
	"id" text PRIMARY KEY, "policySetId" text NOT NULL REFERENCES "CompliancePolicySet"("id") ON DELETE RESTRICT,
	"version" integer NOT NULL, "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','published','retired')),
	"effectiveFrom" timestamptz NOT NULL, "effectiveTo" timestamptz,
	"approvedBy" text REFERENCES "User"("id"), "approvedAt" timestamptz,
	"createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("policySetId","version")
);
CREATE TABLE IF NOT EXISTS "ComplianceRequirementRule" (
	"id" text PRIMARY KEY, "policyVersionId" text NOT NULL REFERENCES "CompliancePolicyVersion"("id") ON DELETE RESTRICT,
	"domain" text NOT NULL CHECK ("domain" IN ('verification','fiscal','documents','payments')),
	"requirementKey" text NOT NULL, "required" boolean NOT NULL DEFAULT true,
	"conditionJson" jsonb, "slaHours" integer NOT NULL DEFAULT 48 CHECK ("slaHours" BETWEEN 1 AND 168),
	"createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("policyVersionId","requirementKey")
);

ALTER TABLE "CompliancePolicySet"
	ADD COLUMN IF NOT EXISTS "policyScope" text NOT NULL DEFAULT 'casework',
	ADD COLUMN IF NOT EXISTS "holderType" text,
	ADD COLUMN IF NOT EXISTS "jurisdictionRole" text NOT NULL DEFAULT 'product';
ALTER TABLE "CompliancePolicyVersion"
	ADD COLUMN IF NOT EXISTS "approvalReference" text;
ALTER TABLE "ComplianceRequirementRule"
	ADD COLUMN IF NOT EXISTS "capabilitiesJson" jsonb,
	ADD COLUMN IF NOT EXISTS "acceptedEvidenceJson" jsonb,
	ADD COLUMN IF NOT EXISTS "blockingAction" text,
	ADD COLUMN IF NOT EXISTS "reviewOwner" text;

DO $$ BEGIN
	ALTER TABLE "CompliancePolicySet" ADD CONSTRAINT "CompliancePolicySet_scope_check"
		CHECK ("policyScope" IN ('casework', 'commercial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "CompliancePolicySet" ADD CONSTRAINT "CompliancePolicySet_holderType_check"
		CHECK ("holderType" IS NULL OR "holderType" IN ('persona_natural', 'entidad'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "CompliancePolicySet" ADD CONSTRAINT "CompliancePolicySet_jurisdictionRole_check"
		CHECK ("jurisdictionRole" IN ('holder', 'tax', 'payout', 'product'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "CompliancePolicySet_commercial_context_idx"
	ON "CompliancePolicySet" ("policyScope", "jurisdictionRole", "country", "vertical", "collectionModel", "holderType", "status");
