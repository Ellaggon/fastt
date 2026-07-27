CREATE TABLE IF NOT EXISTS "ProviderExternalCalendarExport" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"resourceId" TEXT REFERENCES "InventoryResource" ("id"),
	"label" TEXT NOT NULL,
	"tokenHash" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'active',
	"lastDownloadedAt" TIMESTAMPTZ,
	"downloadCount" INTEGER NOT NULL DEFAULT 0,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarExport_provider_status_idx"
	ON "ProviderExternalCalendarExport" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarExport_variant_status_idx"
	ON "ProviderExternalCalendarExport" ("variantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderExternalCalendarExport_token_unique"
	ON "ProviderExternalCalendarExport" ("tokenHash");

CREATE TABLE IF NOT EXISTS "ProviderExternalCalendarSyncJob" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"calendarId" TEXT NOT NULL
		REFERENCES "ProviderExternalCalendar" ("id") ON DELETE CASCADE,
	"connectionId" TEXT
		REFERENCES "ProviderIntegrationConnection" ("id") ON DELETE SET NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderExternalCalendarSyncJob_calendar_idempotency_unique"
	ON "ProviderExternalCalendarSyncJob" ("calendarId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarSyncJob_due_idx"
	ON "ProviderExternalCalendarSyncJob" ("status", "runAfter", "priority");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarSyncJob_provider_status_idx"
	ON "ProviderExternalCalendarSyncJob" ("providerId", "status", "runAfter");

ALTER TABLE "ProviderExternalCalendarSyncJob"
	ADD CONSTRAINT "ProviderExternalCalendarSyncJob_attempts_check"
	CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 12);

