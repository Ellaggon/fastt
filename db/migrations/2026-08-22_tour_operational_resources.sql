-- Phase 4: operational resources are metadata for a scheduled tour date.
-- DailyInventory remains the sole source of sellable capacity and stop-sells.

CREATE TABLE IF NOT EXISTS "TourDepartureInstance" (
  "id" text PRIMARY KEY,
  "providerId" text REFERENCES "Provider"("id"),
  "variantId" text REFERENCES "Variant"("id") NOT NULL,
  "date" date NOT NULL,
  "departureTimeOverride" text,
  "meetingPointOverrideJson" jsonb,
  "notes" text,
  "isCancelled" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "TourDepartureInstance_variant_date_unique" UNIQUE ("variantId", "date")
);
CREATE INDEX IF NOT EXISTS "TourDepartureInstance_provider_date_idx"
  ON "TourDepartureInstance" ("providerId", "date");

CREATE TABLE IF NOT EXISTS "TourOperationalResource" (
  "id" text PRIMARY KEY,
  "providerId" text REFERENCES "Provider"("id") NOT NULL,
  "userId" text REFERENCES "User"("id"),
  "type" text NOT NULL CHECK ("type" IN ('guide', 'vehicle', 'pickup_coordinator')),
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'inactive')),
  "languagesJson" jsonb,
  "capacity" integer,
  "credentialsJson" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "TourOperationalResource_provider_type_status_idx"
  ON "TourOperationalResource" ("providerId", "type", "status");

CREATE TABLE IF NOT EXISTS "TourResourceAssignment" (
  "id" text PRIMARY KEY,
  "providerId" text REFERENCES "Provider"("id") NOT NULL,
  "variantId" text REFERENCES "Variant"("id") NOT NULL,
  "date" date NOT NULL,
  "resourceId" text REFERENCES "TourOperationalResource"("id") NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('lead_guide', 'vehicle', 'pickup')),
  "status" text NOT NULL DEFAULT 'assigned' CHECK ("status" IN ('assigned', 'cancelled')),
  "assignedBy" text REFERENCES "User"("id"),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "TourResourceAssignment_variant_date_role_unique"
    UNIQUE ("variantId", "date", "role")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TourResourceAssignment_resource_date_unique"
  ON "TourResourceAssignment" ("resourceId", "date");
