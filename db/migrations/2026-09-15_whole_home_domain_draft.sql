-- Physical whole-home profile only. No public activation, inventory or checkout bypass.
CREATE TABLE IF NOT EXISTS "WholeHome" (
	"productId" text PRIMARY KEY REFERENCES "Product"("id") ON DELETE CASCADE,
	"exclusiveUse" boolean NOT NULL DEFAULT true CHECK ("exclusiveUse" = true),
	"bedrooms" integer NOT NULL DEFAULT 0,
	"beds" integer NOT NULL DEFAULT 0,
	"bathrooms" integer NOT NULL DEFAULT 1,
	"maxGuests" integer NOT NULL DEFAULT 1,
	"houseRulesJson" jsonb,
	"feesJson" jsonb,
	"createdAt" timestamptz NOT NULL DEFAULT now(),
	"updatedAt" timestamptz NOT NULL DEFAULT now(),
	CHECK ("bedrooms" >= 0 AND "beds" >= 0 AND "bathrooms" >= 1),
	CHECK ("maxGuests" BETWEEN 1 AND 30)
);
