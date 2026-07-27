-- Phase 7: status vocabulary CHECKs, align partial due-sync indexes, cascade
-- calendar feeds with their rollup connection, and document export as variant-scoped.

-- ---------------------------------------------------------------------------
-- Normalize any out-of-vocab rows before CHECKs (should be empty in healthy DBs).
-- ---------------------------------------------------------------------------
UPDATE "ProviderIntegrationConnection"
SET "status" = 'requires_attention', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL
	OR "status" NOT IN (
		'not_configured',
		'pending',
		'connected',
		'requires_attention',
		'syncing',
		'error',
		'revoked'
	);

UPDATE "ProviderIntegrationConnection"
SET "mode" = 'sandbox', "updatedAt" = CURRENT_TIMESTAMP
WHERE "mode" IS NULL OR "mode" NOT IN ('sandbox', 'production');

UPDATE "ProviderExternalCalendar"
SET "status" = 'error', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL OR "status" NOT IN ('pending', 'active', 'error', 'revoked');

UPDATE "ProviderExternalCalendarExport"
SET "status" = 'revoked', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL OR "status" NOT IN ('active', 'revoked');

UPDATE "ProviderExternalCalendarConflict"
SET "status" = 'open', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL OR "status" NOT IN ('open', 'accepted', 'ignored', 'resolved');

UPDATE "ProviderIntegrationMapping"
SET "status" = 'inactive', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL OR "status" NOT IN ('active', 'inactive');

UPDATE "ProviderIntegrationSyncRun"
SET "status" = 'failed'
WHERE "status" IS NULL
	OR "status" NOT IN ('running', 'succeeded', 'partial', 'failed', 'cancelled');

UPDATE "ProviderIntegrationSyncJob"
SET "status" = 'failed', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL OR "status" NOT IN ('queued', 'running', 'succeeded', 'failed');

UPDATE "ProviderIntegrationIncident"
SET "status" = 'open', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IS NULL OR "status" NOT IN ('open', 'resolved');

UPDATE "ProviderIntegrationIncident"
SET "severity" = 'warning', "updatedAt" = CURRENT_TIMESTAMP
WHERE "severity" IS NULL OR "severity" NOT IN ('info', 'warning', 'error', 'critical');

-- ---------------------------------------------------------------------------
-- Status / mode CHECKs (Connection + Calendar first-class; related ops aligned).
-- ---------------------------------------------------------------------------
ALTER TABLE "ProviderIntegrationConnection"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationConnection_status_check";
ALTER TABLE "ProviderIntegrationConnection"
	ADD CONSTRAINT "ProviderIntegrationConnection_status_check"
	CHECK (
		"status" IN (
			'not_configured',
			'pending',
			'connected',
			'requires_attention',
			'syncing',
			'error',
			'revoked'
		)
	);

ALTER TABLE "ProviderIntegrationConnection"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationConnection_mode_check";
ALTER TABLE "ProviderIntegrationConnection"
	ADD CONSTRAINT "ProviderIntegrationConnection_mode_check"
	CHECK ("mode" IN ('sandbox', 'production'));

ALTER TABLE "ProviderExternalCalendar"
	DROP CONSTRAINT IF EXISTS "ProviderExternalCalendar_status_check";
ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_status_check"
	CHECK ("status" IN ('pending', 'active', 'error', 'revoked'));

ALTER TABLE "ProviderExternalCalendarExport"
	DROP CONSTRAINT IF EXISTS "ProviderExternalCalendarExport_status_check";
ALTER TABLE "ProviderExternalCalendarExport"
	ADD CONSTRAINT "ProviderExternalCalendarExport_status_check"
	CHECK ("status" IN ('active', 'revoked'));

ALTER TABLE "ProviderExternalCalendarConflict"
	DROP CONSTRAINT IF EXISTS "ProviderExternalCalendarConflict_status_check";
ALTER TABLE "ProviderExternalCalendarConflict"
	ADD CONSTRAINT "ProviderExternalCalendarConflict_status_check"
	CHECK ("status" IN ('open', 'accepted', 'ignored', 'resolved'));

ALTER TABLE "ProviderIntegrationMapping"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationMapping_status_check";
ALTER TABLE "ProviderIntegrationMapping"
	ADD CONSTRAINT "ProviderIntegrationMapping_status_check"
	CHECK ("status" IN ('active', 'inactive'));

ALTER TABLE "ProviderIntegrationSyncRun"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationSyncRun_status_check";
ALTER TABLE "ProviderIntegrationSyncRun"
	ADD CONSTRAINT "ProviderIntegrationSyncRun_status_check"
	CHECK ("status" IN ('running', 'succeeded', 'partial', 'failed', 'cancelled'));

ALTER TABLE "ProviderIntegrationSyncJob"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationSyncJob_status_check";
ALTER TABLE "ProviderIntegrationSyncJob"
	ADD CONSTRAINT "ProviderIntegrationSyncJob_status_check"
	CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));

ALTER TABLE "ProviderIntegrationIncident"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationIncident_status_check";
ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_status_check"
	CHECK ("status" IN ('open', 'resolved'));

ALTER TABLE "ProviderIntegrationIncident"
	DROP CONSTRAINT IF EXISTS "ProviderIntegrationIncident_severity_check";
ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_severity_check"
	CHECK ("severity" IN ('info', 'warning', 'error', 'critical'));

-- ---------------------------------------------------------------------------
-- Partial due-sync indexes (idempotent recreate — migrations remain SoT).
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "ProviderIntegrationConnection_due_sync_idx";
CREATE INDEX "ProviderIntegrationConnection_due_sync_idx"
	ON "ProviderIntegrationConnection" ("syncEnabled", "status", "nextSyncAt")
	WHERE "syncEnabled" = TRUE AND "status" <> 'revoked';

DROP INDEX IF EXISTS "ProviderExternalCalendar_due_sync_idx";
CREATE INDEX "ProviderExternalCalendar_due_sync_idx"
	ON "ProviderExternalCalendar" ("syncEnabled", "status", "nextSyncAt")
	WHERE "syncEnabled" = TRUE AND "status" <> 'revoked';

-- ---------------------------------------------------------------------------
-- Calendar feeds are subresources of the rollup connection → CASCADE on delete.
-- ---------------------------------------------------------------------------
ALTER TABLE "ProviderExternalCalendar"
	DROP CONSTRAINT IF EXISTS "ProviderExternalCalendar_connectionId_fkey";
ALTER TABLE "ProviderExternalCalendar"
	DROP CONSTRAINT IF EXISTS "ProviderExternalCalendar_connectionId_ProviderIntegrationConnection_id_fk";
ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_connectionId_fkey"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Export is variant-scoped only until bookings can bind to InventoryResource.
-- Clear advisory resourceId so the column cannot imply a filtered feed.
-- ---------------------------------------------------------------------------
UPDATE "ProviderExternalCalendarExport"
SET "resourceId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "resourceId" IS NOT NULL;
