CREATE TABLE IF NOT EXISTS "FiscalActivityEvent" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider"("id"),
	"eventType" text NOT NULL,
	"definitionId" text REFERENCES "TaxFeeDefinition"("id"),
	"definitionVersionId" text REFERENCES "TaxFeeDefinitionVersion"("id"),
	"productId" text REFERENCES "Product"("id"),
	"channel" text,
	"syncRunId" text REFERENCES "ProviderIntegrationSyncRun"("id"),
	"actorUserId" text REFERENCES "User"("id"),
	"actorRole" text,
	"correlationId" text,
	"result" text NOT NULL DEFAULT 'succeeded',
	"riskLevel" text NOT NULL DEFAULT 'low',
	"beforeJson" jsonb,
	"afterJson" jsonb,
	"contextJson" jsonb,
	"createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "FiscalActivityEvent_provider_created_idx"
	ON "FiscalActivityEvent" ("providerId", "createdAt");
CREATE INDEX IF NOT EXISTS "FiscalActivityEvent_provider_type_created_idx"
	ON "FiscalActivityEvent" ("providerId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "FiscalActivityEvent_correlation_idx"
	ON "FiscalActivityEvent" ("correlationId");

CREATE TABLE IF NOT EXISTS "FiscalExportJob" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider"("id"),
	"requestedByUserId" text REFERENCES "User"("id"),
	"format" text NOT NULL,
	"status" text NOT NULL DEFAULT 'requested',
	"from" date NOT NULL,
	"to" date NOT NULL,
	"correlationId" text NOT NULL,
	"createdAt" timestamptz NOT NULL DEFAULT now(),
	"completedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "FiscalExportJob_provider_created_idx"
	ON "FiscalExportJob" ("providerId", "createdAt");

CREATE TABLE IF NOT EXISTS "FiscalReconciliationCase" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider"("id"),
	"bookingId" text NOT NULL REFERENCES "Booking"("id"),
	"status" text NOT NULL DEFAULT 'open',
	"assigneeUserId" text REFERENCES "User"("id"),
	"resolutionComment" text,
	"evidenceJson" jsonb NOT NULL,
	"openedAt" timestamptz NOT NULL DEFAULT now(),
	"resolvedAt" timestamptz,
	"resolvedByUserId" text REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReconciliationCase_provider_booking_unique"
	ON "FiscalReconciliationCase" ("providerId", "bookingId");
CREATE INDEX IF NOT EXISTS "FiscalReconciliationCase_provider_status_idx"
	ON "FiscalReconciliationCase" ("providerId", "status");

CREATE TABLE IF NOT EXISTS "FiscalChannelPublication" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL REFERENCES "Provider"("id"),
	"definitionId" text NOT NULL REFERENCES "TaxFeeDefinition"("id"),
	"definitionVersionId" text REFERENCES "TaxFeeDefinitionVersion"("id"),
	"connectionId" text NOT NULL REFERENCES "ProviderIntegrationConnection"("id"),
	"channel" text NOT NULL,
	"syncRunId" text REFERENCES "ProviderIntegrationSyncRun"("id"),
	"status" text NOT NULL DEFAULT 'pending',
	"divergenceJson" jsonb,
	"payloadJson" jsonb,
	"confirmedAt" timestamptz,
	"createdAt" timestamptz NOT NULL DEFAULT now(),
	"updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalChannelPublication_version_connection_unique"
	ON "FiscalChannelPublication" ("definitionVersionId", "connectionId");
CREATE INDEX IF NOT EXISTS "FiscalChannelPublication_provider_status_idx"
	ON "FiscalChannelPublication" ("providerId", "status");
