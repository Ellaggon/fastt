ALTER TABLE "ProviderProfile"
	ADD COLUMN "governanceUpdatedAt" INTEGER;

CREATE TABLE IF NOT EXISTS "ProviderDocument" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"type" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'pending',
	"fileUrl" TEXT,
	"metadataJson" TEXT,
	"reviewNotes" TEXT,
	"reviewedAt" INTEGER,
	"reviewedBy" TEXT REFERENCES "User" ("id"),
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "ProviderDocument_providerId_type_idx" ON "ProviderDocument" ("providerId", "type");
CREATE INDEX IF NOT EXISTS "ProviderDocument_providerId_status_idx" ON "ProviderDocument" ("providerId", "status");

CREATE TABLE IF NOT EXISTS "ProviderTaxConfiguration" (
	"providerId" TEXT PRIMARY KEY NOT NULL REFERENCES "Provider" ("id"),
	"status" TEXT NOT NULL DEFAULT 'not_configured',
	"taxResidenceCountry" TEXT,
	"businessRegistrationNumber" TEXT,
	"taxRegime" TEXT,
	"invoicingMode" TEXT NOT NULL DEFAULT 'platform_receipt',
	"metadataJson" TEXT,
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	"updatedBy" TEXT REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "ProviderTaxConfiguration_status_idx" ON "ProviderTaxConfiguration" ("status");
CREATE INDEX IF NOT EXISTS "ProviderTaxConfiguration_taxResidenceCountry_idx" ON "ProviderTaxConfiguration" ("taxResidenceCountry");

CREATE TABLE IF NOT EXISTS "ProviderPaymentAccount" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"status" TEXT NOT NULL DEFAULT 'not_configured',
	"provider" TEXT NOT NULL,
	"currency" TEXT NOT NULL,
	"accountReference" TEXT,
	"payoutSchedule" TEXT NOT NULL DEFAULT 'manual',
	"metadataJson" TEXT,
	"verifiedAt" INTEGER,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "ProviderPaymentAccount_providerId_status_idx" ON "ProviderPaymentAccount" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ProviderPaymentAccount_providerId_provider_idx" ON "ProviderPaymentAccount" ("providerId", "provider");

CREATE TABLE IF NOT EXISTS "ProviderIntegrationConnection" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectorKey" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'not_configured',
	"mode" TEXT NOT NULL DEFAULT 'sandbox',
	"scopesJson" TEXT,
	"credentialsRef" TEXT,
	"lastSyncAt" INTEGER,
	"lastSyncStatus" TEXT,
	"errorMessage" TEXT,
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderIntegrationConnection_providerId_connectorKey_idx" ON "ProviderIntegrationConnection" ("providerId", "connectorKey");
CREATE INDEX IF NOT EXISTS "ProviderIntegrationConnection_providerId_status_idx" ON "ProviderIntegrationConnection" ("providerId", "status");

CREATE TABLE IF NOT EXISTS "ProviderAuditLog" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"actorUserId" TEXT REFERENCES "User" ("id"),
	"action" TEXT NOT NULL,
	"entityType" TEXT NOT NULL,
	"entityId" TEXT,
	"beforeJson" TEXT,
	"afterJson" TEXT,
	"riskLevel" TEXT NOT NULL DEFAULT 'low',
	"createdAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "ProviderAuditLog_providerId_createdAt_idx" ON "ProviderAuditLog" ("providerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProviderAuditLog_providerId_entityType_idx" ON "ProviderAuditLog" ("providerId", "entityType");

CREATE TABLE IF NOT EXISTS "ProviderConfigurationState" (
	"providerId" TEXT PRIMARY KEY NOT NULL REFERENCES "Provider" ("id"),
	"canPublish" INTEGER NOT NULL DEFAULT 0,
	"canAcceptBookings" INTEGER NOT NULL DEFAULT 0,
	"canCollectPayments" INTEGER NOT NULL DEFAULT 0,
	"canUseIntegrations" INTEGER NOT NULL DEFAULT 0,
	"readinessPercent" REAL NOT NULL DEFAULT 0,
	"blockersJson" TEXT,
	"risksJson" TEXT,
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "ProviderConfigurationState_canPublish_idx" ON "ProviderConfigurationState" ("canPublish");
CREATE INDEX IF NOT EXISTS "ProviderConfigurationState_canAcceptBookings_idx" ON "ProviderConfigurationState" ("canAcceptBookings");
CREATE INDEX IF NOT EXISTS "ProviderConfigurationState_canCollectPayments_idx" ON "ProviderConfigurationState" ("canCollectPayments");
