-- Candidate lookup is an operational search surface. These indexes keep it
-- bounded at provider scale without turning the financial inbox into a source
-- of truth for all reservations.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.fastt_search_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
	SELECT lower(public.unaccent('public.unaccent', value));
$$;

CREATE INDEX "Booking_provider_externalBookingId_idx"
	ON "Booking" ("providerId", "externalBookingId")
	WHERE "externalBookingId" IS NOT NULL;
CREATE INDEX "Booking_provider_checkInDate_idx" ON "Booking" ("providerId", "checkInDate");
CREATE INDEX "Booking_provider_checkOutDate_idx" ON "Booking" ("providerId", "checkOutDate");
CREATE INDEX "Booking_provider_recent_idx"
	ON "Booking" ("providerId", "confirmedAt" DESC, "bookingDate" DESC);
CREATE INDEX "Booking_guestNameSnapshot_trgm_idx"
	ON "Booking" USING gin (public.fastt_search_normalize(coalesce("guestNameSnapshot", '')) gin_trgm_ops)
	WHERE "guestNameSnapshot" IS NOT NULL;
CREATE INDEX "Booking_guestEmailSnapshot_trgm_idx"
	ON "Booking" USING gin (public.fastt_search_normalize(coalesce("guestEmailSnapshot", '')) gin_trgm_ops)
	WHERE "guestEmailSnapshot" IS NOT NULL;
CREATE INDEX "BookingLineItem_productNameSnapshot_trgm_idx"
	ON "BookingLineItem" USING gin (public.fastt_search_normalize(coalesce("productNameSnapshot", '')) gin_trgm_ops)
	WHERE "productNameSnapshot" IS NOT NULL;
CREATE INDEX "BookingLineItem_variantNameSnapshot_trgm_idx"
	ON "BookingLineItem" USING gin (public.fastt_search_normalize(coalesce("variantNameSnapshot", '')) gin_trgm_ops)
	WHERE "variantNameSnapshot" IS NOT NULL;
