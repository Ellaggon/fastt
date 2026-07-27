-- Phase 3: universal ProviderIntegrationSyncJob queue.
-- Calendar jobs move onto the same lease/retry/idempotency table; drop the parallel queue.

-- Reset in-flight leases so cutover does not leave orphaned running rows.
UPDATE "ProviderIntegrationSyncJob"
SET
	"status" = 'queued',
	"lockedAt" = NULL,
	"lockedBy" = NULL,
	"updatedAt" = NOW()
WHERE "status" = 'running';

UPDATE "ProviderExternalCalendarSyncJob"
SET
	"status" = 'queued',
	"lockedAt" = NULL,
	"lockedBy" = NULL,
	"updatedAt" = NOW()
WHERE "status" = 'running';

ALTER TABLE "ProviderIntegrationSyncJob"
	ADD COLUMN IF NOT EXISTS "targetType" TEXT,
	ADD COLUMN IF NOT EXISTS "targetId" TEXT,
	ADD COLUMN IF NOT EXISTS "payloadJson" JSONB;

-- Existing rows are connection-scoped.
UPDATE "ProviderIntegrationSyncJob"
SET
	"targetType" = 'connection',
	"targetId" = "connectionId"
WHERE "targetType" IS NULL OR "targetId" IS NULL;

ALTER TABLE "ProviderIntegrationSyncJob"
	ALTER COLUMN "targetType" SET DEFAULT 'connection',
	ALTER COLUMN "targetType" SET NOT NULL,
	ALTER COLUMN "targetId" SET NOT NULL;

-- Calendar jobs may omit connectionId (rollup optional / deleted).
ALTER TABLE "ProviderIntegrationSyncJob"
	ALTER COLUMN "connectionId" DROP NOT NULL;

ALTER TABLE "ProviderIntegrationSyncJob"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationSyncJob_target_type_check";
ALTER TABLE "ProviderIntegrationSyncJob"
	ADD CONSTRAINT "ProviderIntegrationSyncJob_target_type_check"
	CHECK ("targetType" IN ('connection', 'external_calendar'));

ALTER TABLE "ProviderIntegrationSyncJob"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationSyncJob_target_shape_check";
ALTER TABLE "ProviderIntegrationSyncJob"
	ADD CONSTRAINT "ProviderIntegrationSyncJob_target_shape_check"
	CHECK (
		(
			"targetType" = 'connection'
			AND "connectionId" IS NOT NULL
			AND "targetId" = "connectionId"
		)
		OR (
			"targetType" = 'external_calendar'
			AND "targetId" IS NOT NULL
		)
	);

DROP INDEX IF EXISTS "ProviderIntegrationSyncJob_connection_idempotency_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationSyncJob_target_idempotency_unique"
	ON "ProviderIntegrationSyncJob" ("targetType", "targetId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncJob_target_due_idx"
	ON "ProviderIntegrationSyncJob" ("targetType", "status", "runAfter", "priority");

-- Copy calendar queue into the universal table (preserve ids when possible).
INSERT INTO "ProviderIntegrationSyncJob" (
	"id",
	"providerId",
	"connectionId",
	"connectorKey",
	"operation",
	"status",
	"trigger",
	"priority",
	"attempts",
	"maxAttempts",
	"runAfter",
	"lockedAt",
	"lockedBy",
	"idempotencyKey",
	"lastError",
	"createdAt",
	"updatedAt",
	"finishedAt",
	"targetType",
	"targetId",
	"payloadJson"
)
SELECT
	c."id",
	c."providerId",
	c."connectionId",
	'external_calendars',
	'calendar_import',
	c."status",
	c."trigger",
	c."priority",
	c."attempts",
	c."maxAttempts",
	c."runAfter",
	c."lockedAt",
	c."lockedBy",
	c."idempotencyKey",
	c."lastError",
	c."createdAt",
	c."updatedAt",
	c."finishedAt",
	'external_calendar',
	c."calendarId",
	NULL
FROM "ProviderExternalCalendarSyncJob" AS c
ON CONFLICT ("id") DO NOTHING;

DROP TABLE IF EXISTS "ProviderExternalCalendarSyncJob";
