-- Bound fair-queue ranking before provider partitioning. The index follows the
-- worker's priority order so candidate selection does not sort the full due queue.

DROP INDEX IF EXISTS "ProviderIntegrationSyncJob_claim_due_idx";
CREATE INDEX "ProviderIntegrationSyncJob_claim_due_idx"
	ON "ProviderIntegrationSyncJob" (
		"targetType",
		"priority",
		"runAfter",
		"createdAt",
		"providerId"
	)
	WHERE "status" = 'queued';
