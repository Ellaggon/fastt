-- The modal searches reservations directly, not the visible financial queue.
-- Trigram indexes keep guest and inventory labels responsive as a provider grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Booking_provider_externalBookingId_idx"
	ON "Booking" ("providerId", "externalBookingId")
	WHERE "externalBookingId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Booking_provider_checkInDate_idx" ON "Booking" ("providerId", "checkInDate");
CREATE INDEX IF NOT EXISTS "Booking_provider_checkOutDate_idx" ON "Booking" ("providerId", "checkOutDate");
CREATE INDEX IF NOT EXISTS "Booking_guestNameSnapshot_trgm_idx"
	ON "Booking" USING gin (lower(coalesce("guestNameSnapshot", '')) gin_trgm_ops)
	WHERE "guestNameSnapshot" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Booking_guestEmailSnapshot_trgm_idx"
	ON "Booking" USING gin (lower(coalesce("guestEmailSnapshot", '')) gin_trgm_ops)
	WHERE "guestEmailSnapshot" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "BookingLineItem_productNameSnapshot_trgm_idx"
	ON "BookingLineItem" USING gin (lower(coalesce("productNameSnapshot", '')) gin_trgm_ops)
	WHERE "productNameSnapshot" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "BookingLineItem_variantNameSnapshot_trgm_idx"
	ON "BookingLineItem" USING gin (lower(coalesce("variantNameSnapshot", '')) gin_trgm_ops)
	WHERE "variantNameSnapshot" IS NOT NULL;
