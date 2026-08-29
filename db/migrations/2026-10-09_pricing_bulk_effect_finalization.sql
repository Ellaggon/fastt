-- A bulk pricing write is complete only after its grouped commercial effects are durable.
-- `finalizing` preserves that boundary across process restarts without repeating rules.

ALTER TABLE "PricingBulkOperationJob"
	ADD COLUMN IF NOT EXISTS "finalizationAttempts" integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "finalizationErrorCode" text,
	ADD COLUMN IF NOT EXISTS "finalizationErrorDetail" text,
	ADD COLUMN IF NOT EXISTS "finalizationStartedAt" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "finalizationFinishedAt" timestamp with time zone;

ALTER TABLE "PricingBulkOperationJob"
	DROP CONSTRAINT IF EXISTS "PricingBulkOperationJob_status_check";

ALTER TABLE "PricingBulkOperationJob"
	ADD CONSTRAINT "PricingBulkOperationJob_status_check"
	CHECK ("status" IN ('queued', 'running', 'finalizing', 'succeeded', 'partial', 'failed', 'cancelled'));

ALTER TABLE "PricingBulkOperationJob"
	ADD CONSTRAINT "PricingBulkOperationJob_finalizationAttempts_check"
	CHECK ("finalizationAttempts" >= 0);

CREATE INDEX IF NOT EXISTS "PricingBulkOperationJob_finalization_due_idx"
	ON "PricingBulkOperationJob" ("runAfter", "createdAt")
	WHERE "status" = 'finalizing' AND "lockedBy" IS NULL;
