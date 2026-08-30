-- Final closure of the durable pricing queue. Only operations implemented by
-- the worker remain valid, and finalization becomes a checkpointed workflow
-- with a bounded operator-attention state.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "PricingBulkOperationJob"
		WHERE "operationType" NOT IN ('create_pricing_rule', 'preview_pricing_rule')
	) THEN
		RAISE EXCEPTION 'PRICING_BULK_UNSUPPORTED_OPERATION_REQUIRES_REVIEW';
	END IF;
END;
$$;

ALTER TABLE "PricingBulkOperationJob"
	ADD COLUMN IF NOT EXISTS "finalizationMaxAttempts" integer NOT NULL DEFAULT 5,
	ADD COLUMN IF NOT EXISTS "materializationCompletedAt" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "cacheInvalidationCompletedAt" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "ariEnqueueCompletedAt" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "requiresAttentionAt" timestamp with time zone;

ALTER TABLE "PricingBulkOperationJob"
	DROP CONSTRAINT IF EXISTS "PricingBulkOperationJob_operationType_check",
	DROP CONSTRAINT IF EXISTS "PricingBulkOperationJob_status_check",
	DROP CONSTRAINT IF EXISTS "PricingBulkOperationJob_finalizationAttempts_check";

ALTER TABLE "PricingBulkOperationJob"
	ADD CONSTRAINT "PricingBulkOperationJob_operationType_check"
		CHECK ("operationType" IN ('create_pricing_rule', 'preview_pricing_rule')),
	ADD CONSTRAINT "PricingBulkOperationJob_status_check"
		CHECK ("status" IN ('queued', 'running', 'finalizing', 'succeeded', 'partial', 'failed', 'requires_attention', 'cancelled')),
	ADD CONSTRAINT "PricingBulkOperationJob_finalizationAttempts_check"
		CHECK (
			"finalizationAttempts" >= 0
			AND "finalizationMaxAttempts" > 0
			AND "finalizationAttempts" <= "finalizationMaxAttempts"
		);

CREATE INDEX IF NOT EXISTS "PricingBulkOperationJob_requires_attention_idx"
	ON "PricingBulkOperationJob" ("providerId", "requiresAttentionAt")
	WHERE "status" = 'requires_attention';
