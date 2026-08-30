-- Preserve the terminal outcome independently from mutable counters so an
-- operator can inspect what the worker certified when finalization completed.
ALTER TABLE "PricingBulkOperationJob"
	ADD COLUMN IF NOT EXISTS "finalizationResultJson" jsonb;
