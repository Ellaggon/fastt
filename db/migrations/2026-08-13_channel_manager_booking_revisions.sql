-- Stage 5: idempotent inbound channel-manager booking revisions.
ALTER TABLE "Booking"
	ADD COLUMN IF NOT EXISTS "integrationConnectionId" text,
	ADD COLUMN IF NOT EXISTS "externalBookingId" text,
	ADD COLUMN IF NOT EXISTS "externalRevisionId" text,
	ADD COLUMN IF NOT EXISTS "externalRevisionAt" timestamp with time zone;

ALTER TABLE "Booking"
	DROP CONSTRAINT IF EXISTS "Booking_integrationConnectionId_fk";
ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_integrationConnectionId_fk"
	FOREIGN KEY ("integrationConnectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Booking_connection_external_booking_unique"
	ON "Booking" ("integrationConnectionId", "externalBookingId")
	WHERE "integrationConnectionId" IS NOT NULL AND "externalBookingId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Booking_connection_external_revision_unique"
	ON "Booking" ("integrationConnectionId", "externalRevisionId")
	WHERE "integrationConnectionId" IS NOT NULL AND "externalRevisionId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Booking_provider_source_booking_date_idx"
	ON "Booking" ("providerId", "source", "bookingDate" DESC);
