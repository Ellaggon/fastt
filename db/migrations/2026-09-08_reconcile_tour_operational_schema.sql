-- Reconciles installations that predate the canonical tour operational schema.
-- This intentionally supersedes the 2026-08-22 and 2026-08-23 migrations:
-- those historical files used timestamp without time zone, while tables.ts and
-- the canonical PostgreSQL baseline use timestamp with time zone.

CREATE TABLE IF NOT EXISTS "TourDepartureInstance" (
  "id" text PRIMARY KEY,
  "providerId" text NOT NULL,
  "variantId" text NOT NULL,
  "date" date NOT NULL,
  "departureTimeOverride" text,
  "meetingPointOverrideJson" jsonb,
  "notes" text,
  "isCancelled" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "TourDepartureInstance_providerId_fk"
    FOREIGN KEY ("providerId") REFERENCES "Provider" ("id"),
  CONSTRAINT "TourDepartureInstance_variantId_fk"
    FOREIGN KEY ("variantId") REFERENCES "Variant" ("id")
);

CREATE TABLE IF NOT EXISTS "TourOperationalResource" (
  "id" text PRIMARY KEY,
  "providerId" text NOT NULL,
  "userId" text,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "languagesJson" jsonb,
  "capacity" integer,
  "credentialsJson" jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "TourOperationalResource_providerId_fk"
    FOREIGN KEY ("providerId") REFERENCES "Provider" ("id"),
  CONSTRAINT "TourOperationalResource_userId_fk"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
);

CREATE TABLE IF NOT EXISTS "TourResourceAssignment" (
  "id" text PRIMARY KEY,
  "providerId" text NOT NULL,
  "variantId" text NOT NULL,
  "date" date NOT NULL,
  "resourceId" text NOT NULL,
  "role" text NOT NULL,
  "status" text NOT NULL DEFAULT 'assigned',
  "assignedBy" text,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "TourResourceAssignment_providerId_fk"
    FOREIGN KEY ("providerId") REFERENCES "Provider" ("id"),
  CONSTRAINT "TourResourceAssignment_variantId_fk"
    FOREIGN KEY ("variantId") REFERENCES "Variant" ("id"),
  CONSTRAINT "TourResourceAssignment_resourceId_fk"
    FOREIGN KEY ("resourceId") REFERENCES "TourOperationalResource" ("id"),
  CONSTRAINT "TourResourceAssignment_assignedBy_fk"
    FOREIGN KEY ("assignedBy") REFERENCES "User" ("id")
);

CREATE TABLE IF NOT EXISTS "TourBookingQuestion" (
  "id" text PRIMARY KEY,
  "productId" text NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "isRequired" boolean NOT NULL DEFAULT false,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "TourBookingQuestion_productId_fk"
    FOREIGN KEY ("productId") REFERENCES "Product" ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TourDepartureInstance_variant_date_unique"
  ON "TourDepartureInstance" ("variantId", "date");
CREATE INDEX IF NOT EXISTS "TourDepartureInstance_provider_date_idx"
  ON "TourDepartureInstance" ("providerId", "date");
CREATE INDEX IF NOT EXISTS "TourOperationalResource_provider_type_status_idx"
  ON "TourOperationalResource" ("providerId", "type", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "TourResourceAssignment_variant_date_role_unique"
  ON "TourResourceAssignment" ("variantId", "date", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "TourResourceAssignment_resource_date_unique"
  ON "TourResourceAssignment" ("resourceId", "date");
CREATE INDEX IF NOT EXISTS "TourBookingQuestion_product_sort_idx"
  ON "TourBookingQuestion" ("productId", "sortOrder");
