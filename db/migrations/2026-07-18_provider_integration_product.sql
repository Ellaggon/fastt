CREATE TABLE IF NOT EXISTS "ProviderIntegrationSyncLog" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectorKey" TEXT NOT NULL,
	"connectionId" TEXT REFERENCES "ProviderIntegrationConnection" ("id"),
	"eventType" TEXT NOT NULL,
	"status" TEXT NOT NULL,
	"mode" TEXT NOT NULL DEFAULT 'sandbox',
	"message" TEXT,
	"metadataJson" TEXT,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncLog_providerId_connectorKey_createdAt_idx" ON "ProviderIntegrationSyncLog" ("providerId", "connectorKey", "createdAt");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationSyncLog_providerId_status_idx" ON "ProviderIntegrationSyncLog" ("providerId", "status");
