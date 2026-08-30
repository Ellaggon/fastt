-- Durable queue for provider-scoped bulk pricing commands. A job preserves the
-- immutable administrator intent; each rate plan has an independently
-- retryable result row with its own commercial outcome.

CREATE TABLE "PricingBulkOperationJob" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"requestedByUserId" text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"payloadHash" text NOT NULL,
	"operationType" text NOT NULL,
	"commandJson" jsonb NOT NULL,
	"status" text NOT NULL DEFAULT 'queued',
	"totalItems" integer NOT NULL DEFAULT 0,
	"pendingItems" integer NOT NULL DEFAULT 0,
	"runningItems" integer NOT NULL DEFAULT 0,
	"completedItems" integer NOT NULL DEFAULT 0,
	"succeededItems" integer NOT NULL DEFAULT 0,
	"failedItems" integer NOT NULL DEFAULT 0,
	"skippedItems" integer NOT NULL DEFAULT 0,
	"cancelledItems" integer NOT NULL DEFAULT 0,
	"attempts" integer NOT NULL DEFAULT 0,
	"maxAttempts" integer NOT NULL DEFAULT 3,
	"runAfter" timestamp with time zone NOT NULL DEFAULT now(),
	"lockedAt" timestamp with time zone,
	"lockedBy" text,
	"finalErrorCode" text,
	"finalErrorDetail" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	CONSTRAINT "PricingBulkOperationJob_providerId_fk" FOREIGN KEY ("providerId") REFERENCES "Provider"("id"),
	CONSTRAINT "PricingBulkOperationJob_requestedByUserId_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id"),
	CONSTRAINT "PricingBulkOperationJob_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
	CONSTRAINT "PricingBulkOperationJob_operationType_check" CHECK ("operationType" IN ('create_pricing_rule', 'update_pricing_rule', 'delete_pricing_rule')),
	CONSTRAINT "PricingBulkOperationJob_idempotencyKey_not_blank" CHECK (length(trim("idempotencyKey")) > 0),
	CONSTRAINT "PricingBulkOperationJob_payloadHash_sha256_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "PricingBulkOperationJob_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts"),
	CONSTRAINT "PricingBulkOperationJob_progress_nonnegative_check" CHECK (
		"totalItems" >= 0 AND "pendingItems" >= 0 AND "runningItems" >= 0 AND "completedItems" >= 0
		AND "succeededItems" >= 0 AND "failedItems" >= 0 AND "skippedItems" >= 0 AND "cancelledItems" >= 0
	),
	CONSTRAINT "PricingBulkOperationJob_progress_balance_check" CHECK (
		"completedItems" = "succeededItems" + "failedItems" + "skippedItems" + "cancelledItems"
		AND "totalItems" = "pendingItems" + "runningItems" + "completedItems"
	)
);

CREATE TABLE "PricingBulkOperationItem" (
	"id" text PRIMARY KEY,
	"jobId" text NOT NULL,
	"ratePlanId" text NOT NULL,
	"productIdSnapshot" text NOT NULL,
	"productNameSnapshot" text,
	"variantIdSnapshot" text NOT NULL,
	"variantNameSnapshot" text,
	"status" text NOT NULL DEFAULT 'queued',
	"attempts" integer NOT NULL DEFAULT 0,
	"ruleId" text,
	"previewResultJson" jsonb,
	"materializationResultJson" jsonb,
	"errorCode" text,
	"errorDetail" text,
	"commercialImpactJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	CONSTRAINT "PricingBulkOperationItem_jobId_fk" FOREIGN KEY ("jobId") REFERENCES "PricingBulkOperationJob"("id") ON DELETE CASCADE,
	CONSTRAINT "PricingBulkOperationItem_ratePlanId_fk" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id"),
	CONSTRAINT "PricingBulkOperationItem_ruleId_fk" FOREIGN KEY ("ruleId") REFERENCES "CommercialRule"("id") ON DELETE SET NULL,
	CONSTRAINT "PricingBulkOperationItem_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')),
	CONSTRAINT "PricingBulkOperationItem_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "PricingBulkOperationItem_job_ratePlan_unique" UNIQUE ("jobId", "ratePlanId")
);

CREATE UNIQUE INDEX "PricingBulkOperationJob_provider_idempotency_unique"
	ON "PricingBulkOperationJob" ("providerId", "idempotencyKey");
CREATE INDEX "PricingBulkOperationJob_claim_due_idx"
	ON "PricingBulkOperationJob" ("runAfter", "createdAt", "providerId")
	WHERE "status" = 'queued';
CREATE INDEX "PricingBulkOperationJob_provider_status_idx"
	ON "PricingBulkOperationJob" ("providerId", "status", "runAfter");
CREATE INDEX "PricingBulkOperationJob_terminal_retention_idx"
	ON "PricingBulkOperationJob" ("status", "finishedAt")
	WHERE "status" IN ('succeeded', 'partial', 'failed', 'cancelled') AND "finishedAt" IS NOT NULL;
CREATE INDEX "PricingBulkOperationItem_job_status_idx"
	ON "PricingBulkOperationItem" ("jobId", "status", "createdAt");
CREATE INDEX "PricingBulkOperationItem_ratePlan_status_idx"
	ON "PricingBulkOperationItem" ("ratePlanId", "status");

DROP TRIGGER IF EXISTS "trg_PricingBulkOperationJob_touch_updatedAt" ON "PricingBulkOperationJob";
CREATE TRIGGER "trg_PricingBulkOperationJob_touch_updatedAt"
BEFORE UPDATE ON "PricingBulkOperationJob"
FOR EACH ROW
EXECUTE FUNCTION fastt_touch_updated_at();

DROP TRIGGER IF EXISTS "trg_PricingBulkOperationItem_touch_updatedAt" ON "PricingBulkOperationItem";
CREATE TRIGGER "trg_PricingBulkOperationItem_touch_updatedAt"
BEFORE UPDATE ON "PricingBulkOperationItem"
FOR EACH ROW
EXECUTE FUNCTION fastt_touch_updated_at();

CREATE OR REPLACE FUNCTION fastt_prevent_pricing_bulk_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."providerId" IS DISTINCT FROM OLD."providerId"
		OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
		OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
		OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
		OR NEW."operationType" IS DISTINCT FROM OLD."operationType"
		OR NEW."commandJson" IS DISTINCT FROM OLD."commandJson" THEN
		RAISE EXCEPTION 'PRICING_BULK_OPERATION_COMMAND_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_PricingBulkOperationJob_command_immutable"
BEFORE UPDATE ON "PricingBulkOperationJob"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_pricing_bulk_command_mutation();
