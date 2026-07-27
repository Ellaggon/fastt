CREATE TABLE IF NOT EXISTS "InventoryResource" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"label" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'active',
	"externalCode" TEXT,
	"metadataJson" JSONB,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "InventoryResource_provider_variant_status_idx"
	ON "InventoryResource" ("providerId", "variantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryResource_variant_label_unique"
	ON "InventoryResource" ("variantId", "label");

ALTER TABLE "ProviderExternalCalendar"
	ADD COLUMN IF NOT EXISTS "resourceId" TEXT REFERENCES "InventoryResource" ("id");
ALTER TABLE "ProviderExternalCalendarEvent"
	ADD COLUMN IF NOT EXISTS "resourceId" TEXT REFERENCES "InventoryResource" ("id");

CREATE INDEX IF NOT EXISTS "ProviderExternalCalendar_resource_status_idx"
	ON "ProviderExternalCalendar" ("resourceId", "status");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarEvent_resource_active_range_idx"
	ON "ProviderExternalCalendarEvent" ("resourceId", "isActive", "startDate", "endDate");

CREATE TABLE IF NOT EXISTS "ProviderExternalCalendarConflict" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"calendarId" TEXT NOT NULL REFERENCES "ProviderExternalCalendar" ("id") ON DELETE CASCADE,
	"variantId" TEXT NOT NULL REFERENCES "Variant" ("id"),
	"resourceId" TEXT REFERENCES "InventoryResource" ("id"),
	"kind" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'open',
	"dedupeKey" TEXT NOT NULL,
	"startDate" DATE NOT NULL,
	"endDate" DATE NOT NULL,
	"title" TEXT NOT NULL,
	"description" TEXT NOT NULL,
	"actionLabel" TEXT,
	"resolutionNote" TEXT,
	"actedAt" TIMESTAMPTZ,
	"actedBy" TEXT REFERENCES "User" ("id"),
	"firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"metadataJson" JSONB,
	"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderExternalCalendarConflict_calendar_dedupe_unique"
	ON "ProviderExternalCalendarConflict" ("calendarId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarConflict_provider_status_idx"
	ON "ProviderExternalCalendarConflict" ("providerId", "status", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "ProviderExternalCalendarConflict_calendar_status_idx"
	ON "ProviderExternalCalendarConflict" ("calendarId", "status");
