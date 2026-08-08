-- P2: verified reviews, marketplace telemetry, private salida requests.

-- 4.1 ProductReview ↔ booking (one review per booking; moderation default)
ALTER TABLE "ProductReview"
	ADD COLUMN IF NOT EXISTS "bookingId" text REFERENCES "Booking"("id");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductReview_bookingId_unique"
	ON "ProductReview" ("bookingId")
	WHERE "bookingId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ProductReview_bookingId_idx" ON "ProductReview" ("bookingId");

ALTER TABLE "ProductReview"
	ALTER COLUMN "status" SET DEFAULT 'pending';

-- 4.3 Cross-sell attribution (impressions / clicks / attributed bookings)
CREATE TABLE IF NOT EXISTS "MarketplaceEvent" (
	"id" text PRIMARY KEY,
	"eventType" text NOT NULL,
	"surface" text NOT NULL,
	"sourceProductId" text REFERENCES "Product"("id"),
	"targetProductId" text REFERENCES "Product"("id"),
	"destinationId" text REFERENCES "Destination"("id"),
	"bookingId" text REFERENCES "Booking"("id"),
	"sessionId" text,
	"metaJson" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "MarketplaceEvent_eventType_check"
		CHECK ("eventType" IN ('impression', 'click', 'booking_attributed'))
);
CREATE INDEX IF NOT EXISTS "MarketplaceEvent_surface_created_idx"
	ON "MarketplaceEvent" ("surface", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceEvent_target_created_idx"
	ON "MarketplaceEvent" ("targetProductId", "createdAt");

-- 4.4 Private salida quote requests (no inventory hold until provider accepts)
CREATE TABLE IF NOT EXISTS "TourPrivateRequest" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product"("id"),
	"variantId" text NOT NULL REFERENCES "Variant"("id"),
	"providerId" text NOT NULL REFERENCES "Provider"("id"),
	"userId" text REFERENCES "User"("id"),
	"departureDate" date NOT NULL,
	"partyJson" jsonb NOT NULL,
	"contactName" text NOT NULL,
	"contactEmail" text NOT NULL,
	"contactPhone" text,
	"message" text,
	"status" text NOT NULL DEFAULT 'pending',
	"slaDueAt" timestamp with time zone,
	"providerNote" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "TourPrivateRequest_status_check"
		CHECK ("status" IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS "TourPrivateRequest_provider_status_idx"
	ON "TourPrivateRequest" ("providerId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TourPrivateRequest_product_idx"
	ON "TourPrivateRequest" ("productId", "departureDate");
