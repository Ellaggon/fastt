-- Make financial reconciliation lookup accent-insensitive, deterministic and
-- efficient for both recent reservations and textual matches.
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

DROP INDEX IF EXISTS "Booking_guestNameSnapshot_trgm_idx";
DROP INDEX IF EXISTS "Booking_guestEmailSnapshot_trgm_idx";
DROP INDEX IF EXISTS "BookingLineItem_productNameSnapshot_trgm_idx";
DROP INDEX IF EXISTS "BookingLineItem_variantNameSnapshot_trgm_idx";

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
CREATE INDEX IF NOT EXISTS "Booking_provider_recent_idx"
	ON "Booking" ("providerId", "confirmedAt" DESC, "bookingDate" DESC);
