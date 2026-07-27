ALTER TABLE "ProviderIntegrationConnection"
	ADD COLUMN IF NOT EXISTS "displayName" TEXT,
	ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ProviderIntegrationConnection"
SET "isPrimary" = true
WHERE "id" IN (
	SELECT DISTINCT ON ("providerId", "connectorKey") "id"
	FROM "ProviderIntegrationConnection"
	ORDER BY "providerId", "connectorKey", "createdAt", "id"
);

DROP INDEX IF EXISTS "ProviderIntegrationConnection_providerId_connectorKey_idx";
DROP INDEX IF EXISTS "ProviderIntegrationConnection_provider_connector_unique";

CREATE INDEX IF NOT EXISTS "ProviderIntegrationConnection_provider_connector_idx"
	ON "ProviderIntegrationConnection" ("providerId", "connectorKey");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationConnection_provider_connector_primary_idx"
	ON "ProviderIntegrationConnection" ("providerId", "connectorKey", "isPrimary");

CREATE TABLE IF NOT EXISTS "ProviderIntegrationMapping" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectionId" TEXT NOT NULL
		REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE CASCADE,
	"mappingType" TEXT NOT NULL,
	"localEntityType" TEXT NOT NULL,
	"localEntityId" TEXT NOT NULL,
	"externalEntityType" TEXT NOT NULL,
	"externalEntityId" TEXT NOT NULL,
	"externalEntityName" TEXT,
	"direction" TEXT NOT NULL DEFAULT 'bidirectional',
	"status" TEXT NOT NULL DEFAULT 'active',
	"metadataJson" JSONB,
	"lastVerifiedAt" TIMESTAMPTZ,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationMapping_connection_local_unique"
	ON "ProviderIntegrationMapping" ("connectionId", "mappingType", "localEntityId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationMapping_connection_external_unique"
	ON "ProviderIntegrationMapping" ("connectionId", "mappingType", "externalEntityId");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationMapping_provider_status_idx"
	ON "ProviderIntegrationMapping" ("providerId", "status");

CREATE TABLE IF NOT EXISTS "ProviderIntegrationSyncRun" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectionId" TEXT NOT NULL
		REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE CASCADE,
	"connectorKey" TEXT NOT NULL,
	"operation" TEXT NOT NULL,
	"trigger" TEXT NOT NULL DEFAULT 'manual',
	"status" TEXT NOT NULL DEFAULT 'running',
	"idempotencyKey" TEXT,
	"readCount" INTEGER NOT NULL DEFAULT 0,
	"changedCount" INTEGER NOT NULL DEFAULT 0,
	"skippedCount" INTEGER NOT NULL DEFAULT 0,
	"failedCount" INTEGER NOT NULL DEFAULT 0,
	"cursor" TEXT,
	"errorCode" TEXT,
	"errorMessage" TEXT,
	"summaryJson" JSONB,
	"requestedBy" TEXT REFERENCES "User" ("id"),
	"startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"finishedAt" TIMESTAMPTZ,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationSyncRun_connection_idempotency_unique"
	ON "ProviderIntegrationSyncRun" ("connectionId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncRun_connection_started_idx"
	ON "ProviderIntegrationSyncRun" ("connectionId", "startedAt");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncRun_provider_status_started_idx"
	ON "ProviderIntegrationSyncRun" ("providerId", "status", "startedAt");

CREATE TABLE IF NOT EXISTS "ProviderIntegrationIncident" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectionId" TEXT NOT NULL
		REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE CASCADE,
	"syncRunId" TEXT REFERENCES "ProviderIntegrationSyncRun" ("id") ON DELETE SET NULL,
	"mappingId" TEXT REFERENCES "ProviderIntegrationMapping" ("id") ON DELETE SET NULL,
	"dedupeKey" TEXT NOT NULL,
	"code" TEXT NOT NULL,
	"category" TEXT NOT NULL,
	"severity" TEXT NOT NULL DEFAULT 'warning',
	"status" TEXT NOT NULL DEFAULT 'open',
	"title" TEXT NOT NULL,
	"description" TEXT NOT NULL,
	"actionLabel" TEXT,
	"actionHref" TEXT,
	"entityType" TEXT,
	"entityId" TEXT,
	"occurrenceCount" INTEGER NOT NULL DEFAULT 1,
	"firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"resolvedAt" TIMESTAMPTZ,
	"resolvedBy" TEXT REFERENCES "User" ("id"),
	"resolutionNote" TEXT,
	"metadataJson" JSONB,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationIncident_connection_dedupe_unique"
	ON "ProviderIntegrationIncident" ("connectionId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationIncident_provider_status_severity_idx"
	ON "ProviderIntegrationIncident" ("providerId", "status", "severity");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationIncident_connection_last_seen_idx"
	ON "ProviderIntegrationIncident" ("connectionId", "lastSeenAt");
