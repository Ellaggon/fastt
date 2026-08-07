-- TourSlotProfile close-out (Fase 2):
-- durationMinutes (override product), isActive, bookingMode default.

ALTER TABLE "TourSlotProfile"
	ADD COLUMN IF NOT EXISTS "durationMinutes" integer,
	ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

ALTER TABLE "TourSlotProfile"
	ALTER COLUMN "bookingMode" SET DEFAULT 'shared';

UPDATE "TourSlotProfile"
SET "bookingMode" = 'shared'
WHERE "bookingMode" IS NULL OR btrim("bookingMode") = '';

UPDATE "TourSlotProfile"
SET "isActive" = true
WHERE "isActive" IS NULL;
