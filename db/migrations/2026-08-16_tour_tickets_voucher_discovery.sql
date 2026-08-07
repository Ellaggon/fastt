-- Fase 4+5 tours: tickets, cancel hours, voucher, categories, reviews.

-- Fase 4A: TourTicketType
CREATE TABLE IF NOT EXISTS "TourTicketType" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product"("id"),
	"code" text NOT NULL,
	"label" text NOT NULL,
	"minAge" integer,
	"maxAge" integer,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "TourTicketType_code_check" CHECK ("code" IN ('adult', 'child', 'infant', 'custom'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "TourTicketType_product_code_unique"
	ON "TourTicketType" ("productId", "code");
CREATE INDEX IF NOT EXISTS "TourTicketType_productId_idx" ON "TourTicketType" ("productId");

-- Fase 4B: cancel hours
ALTER TABLE "CancellationTier"
	ADD COLUMN IF NOT EXISTS "hoursBeforeDeparture" integer;
CREATE INDEX IF NOT EXISTS "CancellationTier_hoursBeforeDeparture_idx"
	ON "CancellationTier" ("hoursBeforeDeparture");

-- Fase 4C: BookingVoucher (day-of uses Booking.checkedInAt)
CREATE TABLE IF NOT EXISTS "BookingVoucher" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL REFERENCES "Booking"("id"),
	"code" text NOT NULL,
	"status" text NOT NULL,
	"issuedAt" timestamp with time zone DEFAULT now(),
	"redeemedAt" timestamp with time zone,
	"instructionsJson" jsonb,
	"qrPayload" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "BookingVoucher_status_check" CHECK ("status" IN ('issued', 'redeemed', 'void'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "BookingVoucher_bookingId_unique" ON "BookingVoucher" ("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS "BookingVoucher_code_unique" ON "BookingVoucher" ("code");
CREATE INDEX IF NOT EXISTS "BookingVoucher_status_idx" ON "BookingVoucher" ("status");

-- Fase 5: discovery taxonomy + reviews
CREATE TABLE IF NOT EXISTS "ProductCategory" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"vertical" text NOT NULL,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_slug_unique" ON "ProductCategory" ("slug");
CREATE INDEX IF NOT EXISTS "ProductCategory_vertical_idx" ON "ProductCategory" ("vertical");

CREATE TABLE IF NOT EXISTS "ProductCategoryLink" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product"("id"),
	"categoryId" text NOT NULL REFERENCES "ProductCategory"("id"),
	"createdAt" timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategoryLink_product_category_unique"
	ON "ProductCategoryLink" ("productId", "categoryId");
CREATE INDEX IF NOT EXISTS "ProductCategoryLink_categoryId_idx" ON "ProductCategoryLink" ("categoryId");
CREATE INDEX IF NOT EXISTS "ProductCategoryLink_productId_idx" ON "ProductCategoryLink" ("productId");

CREATE TABLE IF NOT EXISTS "ProductReview" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL REFERENCES "Product"("id"),
	"userId" text REFERENCES "User"("id"),
	"rating" integer NOT NULL,
	"body" text,
	"status" text NOT NULL DEFAULT 'published',
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ProductReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5),
	CONSTRAINT "ProductReview_status_check" CHECK ("status" IN ('published', 'pending', 'rejected', 'hidden'))
);
CREATE INDEX IF NOT EXISTS "ProductReview_product_status_idx"
	ON "ProductReview" ("productId", "status");
CREATE INDEX IF NOT EXISTS "ProductReview_product_rating_idx"
	ON "ProductReview" ("productId", "rating");

-- Ensure Tour discovery indexes (Fase 1 may already have created them)
CREATE INDEX IF NOT EXISTS "Tour_durationMinutes_idx" ON "Tour" ("durationMinutes");
CREATE INDEX IF NOT EXISTS "Tour_difficultyLevel_idx" ON "Tour" ("difficultyLevel");

-- Seed default tour categories (idempotent)
INSERT INTO "ProductCategory" ("id", "slug", "name", "vertical", "sortOrder", "isActive")
VALUES
	('cat_tour_trekking', 'trekking', 'Trekking', 'tour', 10, true),
	('cat_tour_city-tour', 'city-tour', 'City Tour', 'tour', 20, true),
	('cat_tour_cultural', 'cultural', 'Cultural', 'tour', 30, true),
	('cat_tour_wildlife', 'wildlife', 'Wildlife', 'tour', 40, true),
	('cat_tour_adventure', 'adventure', 'Adventure', 'tour', 50, true),
	('cat_tour_gastronomy', 'gastronomy', 'Gastronomy', 'tour', 60, true),
	('cat_tour_water-activities', 'water-activities', 'Water Activities', 'tour', 70, true),
	('cat_tour_ski', 'ski', 'Ski', 'tour', 80, true),
	('cat_tour_cruise', 'cruise', 'Cruise', 'tour', 90, true)
ON CONFLICT ("id") DO NOTHING;
