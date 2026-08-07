-- TourSlotProfile (Fase 2): one profile per tour_slot Variant (hora, cupo, idioma, modo).

CREATE TABLE IF NOT EXISTS "TourSlotProfile" (
	"variantId" text PRIMARY KEY REFERENCES "Variant"("id"),
	"departureTime" text NOT NULL,
	"durationMinutes" integer,
	"maxPax" integer NOT NULL,
	"languageCode" text NOT NULL,
	"bookingMode" text NOT NULL DEFAULT 'shared',
	"meetingPointOverrideJson" jsonb,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "TourSlotProfile_bookingMode_check" CHECK ("bookingMode" IN ('shared', 'private')),
	CONSTRAINT "TourSlotProfile_maxPax_check" CHECK ("maxPax" >= 1)
);

CREATE INDEX IF NOT EXISTS "TourSlotProfile_departureTime_idx" ON "TourSlotProfile" ("departureTime");
CREATE INDEX IF NOT EXISTS "TourSlotProfile_languageCode_idx" ON "TourSlotProfile" ("languageCode");
CREATE INDEX IF NOT EXISTS "TourSlotProfile_bookingMode_idx" ON "TourSlotProfile" ("bookingMode");
