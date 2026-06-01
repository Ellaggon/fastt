-- Fase 6: professional policy preset metadata.
-- These attributes belong to the policy version, not to assignments.

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "policyPresetKey" TEXT;

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "stayLengthType" TEXT;

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "gracePeriod" INTEGER;

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "refundBasis" TEXT;

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "payoutBasis" TEXT;

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "localTimezone" TEXT;

ALTER TABLE "Policy"
	ADD COLUMN IF NOT EXISTS "legalOverrideFlags" JSON;
