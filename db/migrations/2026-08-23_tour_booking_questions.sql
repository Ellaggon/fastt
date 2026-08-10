CREATE TABLE IF NOT EXISTS "TourBookingQuestion" (
  "id" text PRIMARY KEY,
  "productId" text NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "isRequired" boolean NOT NULL DEFAULT false,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "TourBookingQuestion_product_sort_idx"
ON "TourBookingQuestion" ("productId", "sortOrder");
