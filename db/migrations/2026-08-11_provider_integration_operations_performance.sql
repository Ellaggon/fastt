-- Query-shape indexes for the universal worker, iCal reads and operational retention.

DROP INDEX IF EXISTS "ProviderIntegrationSyncJob_due_idx";
DROP INDEX IF EXISTS "ProviderIntegrationSyncJob_target_due_idx";
CREATE INDEX "ProviderIntegrationSyncJob_claim_due_idx"
	ON "ProviderIntegrationSyncJob" (
		"targetType",
		"runAfter",
		"priority",
		"createdAt",
		"providerId"
	)
	WHERE "status" = 'queued';

CREATE INDEX "ProviderIntegrationSyncJob_terminal_retention_idx"
	ON "ProviderIntegrationSyncJob" ("status", "finishedAt")
	WHERE "status" IN ('succeeded', 'failed') AND "finishedAt" IS NOT NULL;

DROP INDEX IF EXISTS "ProviderExternalCalendar_due_sync_idx";
CREATE INDEX "ProviderExternalCalendar_due_sync_idx"
	ON "ProviderExternalCalendar" ("nextSyncAt", "id")
	WHERE "syncEnabled" = TRUE AND "status" <> 'revoked';

DROP INDEX IF EXISTS "ProviderExternalCalendarEvent_variant_active_range_idx";
CREATE INDEX "ProviderExternalCalendarEvent_variant_active_range_idx"
	ON "ProviderExternalCalendarEvent" ("variantId", "startDate", "endDate")
	WHERE "isActive" = TRUE;

DROP INDEX IF EXISTS "ProviderExternalCalendarEvent_resource_active_range_idx";
CREATE INDEX "ProviderExternalCalendarEvent_resource_active_range_idx"
	ON "ProviderExternalCalendarEvent" ("resourceId", "startDate", "endDate")
	WHERE "isActive" = TRUE AND "resourceId" IS NOT NULL;

CREATE INDEX "ProviderExternalCalendarEvent_inactive_retention_idx"
	ON "ProviderExternalCalendarEvent" ("lastSeenAt")
	WHERE "isActive" = FALSE;

CREATE INDEX "ProviderExternalCalendarEvent_ended_retention_idx"
	ON "ProviderExternalCalendarEvent" ("endDate");

DROP INDEX IF EXISTS "ProviderIntegrationSyncRun_connection_started_idx";
CREATE INDEX "ProviderIntegrationSyncRun_connection_started_idx"
	ON "ProviderIntegrationSyncRun" ("connectionId", "startedAt" DESC);

CREATE INDEX "ProviderIntegrationSyncRun_terminal_retention_idx"
	ON "ProviderIntegrationSyncRun" ("status", "finishedAt")
	WHERE "status" <> 'running' AND "finishedAt" IS NOT NULL;

CREATE INDEX "ProviderIntegrationIncident_open_last_seen_idx"
	ON "ProviderIntegrationIncident" ("lastSeenAt" DESC)
	WHERE "status" = 'open';
