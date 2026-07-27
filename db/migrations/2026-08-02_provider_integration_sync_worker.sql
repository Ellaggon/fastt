ALTER TABLE "ProviderIntegrationConnection"
	ADD COLUMN IF NOT EXISTS "syncEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
	ADD COLUMN IF NOT EXISTS "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
	ADD COLUMN IF NOT EXISTS "nextSyncAt" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "lastAutomaticSyncAt" TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

UPDATE "ProviderIntegrationConnection"
SET
	"syncEnabled" = TRUE,
	"nextSyncAt" = COALESCE("lastSyncAt", CURRENT_TIMESTAMP),
	"updatedAt" = CURRENT_TIMESTAMP
WHERE
	"status" = 'connected'
	AND "connectorKey" <> 'external_calendars'
	AND "nextSyncAt" IS NULL;

CREATE INDEX IF NOT EXISTS "ProviderIntegrationConnection_due_sync_idx"
	ON "ProviderIntegrationConnection" ("syncEnabled", "status", "nextSyncAt")
	WHERE "syncEnabled" = TRUE AND "status" <> 'revoked';

ALTER TABLE "ProviderIntegrationConnection"
	ADD CONSTRAINT "ProviderIntegrationConnection_sync_interval_check"
	CHECK ("syncIntervalMinutes" BETWEEN 15 AND 10080);

ALTER TABLE "ProviderIntegrationConnection"
	ADD CONSTRAINT "ProviderIntegrationConnection_consecutive_failures_check"
	CHECK ("consecutiveFailures" >= 0);

CREATE TABLE IF NOT EXISTS "ProviderIntegrationSyncJob" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectionId" TEXT NOT NULL
		REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE CASCADE,
	"connectorKey" TEXT NOT NULL,
	"operation" TEXT NOT NULL DEFAULT 'connection_test',
	"status" TEXT NOT NULL DEFAULT 'queued',
	"trigger" TEXT NOT NULL DEFAULT 'scheduled',
	"priority" INTEGER NOT NULL DEFAULT 100,
	"attempts" INTEGER NOT NULL DEFAULT 0,
	"maxAttempts" INTEGER NOT NULL DEFAULT 5,
	"runAfter" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"lockedAt" TIMESTAMPTZ,
	"lockedBy" TEXT,
	"idempotencyKey" TEXT NOT NULL,
	"lastError" TEXT,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"finishedAt" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationSyncJob_connection_idempotency_unique"
	ON "ProviderIntegrationSyncJob" ("connectionId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncJob_due_idx"
	ON "ProviderIntegrationSyncJob" ("status", "runAfter", "priority");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncJob_provider_status_idx"
	ON "ProviderIntegrationSyncJob" ("providerId", "status", "runAfter");

ALTER TABLE "ProviderIntegrationSyncJob"
	ADD CONSTRAINT "ProviderIntegrationSyncJob_attempts_check"
	CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 12);

