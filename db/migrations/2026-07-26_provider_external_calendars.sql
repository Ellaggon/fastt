CREATE TABLE IF NOT EXISTS "ProviderExternalCalendar" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"connectionId" TEXT REFERENCES "ProviderIntegrationConnection" ("id"),
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"name" TEXT NOT NULL,
	"feedUrl" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'pending',
	"lastSyncAt" TIMESTAMPTZ,
	"lastSyncStatus" TEXT,
	"lastError" TEXT,
	"lastEventCount" INTEGER NOT NULL DEFAULT 0,
	"etag" TEXT,
	"lastModified" TEXT,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProviderExternalCalendar_provider_status_idx"
	ON "ProviderExternalCalendar" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendar_variant_status_idx"
	ON "ProviderExternalCalendar" ("variantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderExternalCalendar_provider_variant_url_unique"
	ON "ProviderExternalCalendar" ("providerId", "variantId", "feedUrl");

CREATE TABLE IF NOT EXISTS "ProviderExternalCalendarEvent" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"calendarId" TEXT NOT NULL REFERENCES "ProviderExternalCalendar" ("id") ON DELETE CASCADE,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"sourceKey" TEXT NOT NULL,
	"externalUid" TEXT NOT NULL,
	"summary" TEXT,
	"startDate" DATE NOT NULL,
	"endDate" DATE NOT NULL,
	"sourceUpdatedAt" TIMESTAMPTZ,
	"fingerprint" TEXT NOT NULL,
	"isActive" BOOLEAN NOT NULL DEFAULT true,
	"firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderExternalCalendarEvent_calendar_source_unique"
	ON "ProviderExternalCalendarEvent" ("calendarId", "sourceKey");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarEvent_variant_active_range_idx"
	ON "ProviderExternalCalendarEvent" ("variantId", "isActive", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarEvent_calendar_active_idx"
	ON "ProviderExternalCalendarEvent" ("calendarId", "isActive");

ALTER TABLE "EffectiveAvailability"
	ADD COLUMN IF NOT EXISTS "externalBlockedUnits" INTEGER NOT NULL DEFAULT 0;
