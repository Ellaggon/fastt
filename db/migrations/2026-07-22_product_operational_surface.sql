CREATE TABLE IF NOT EXISTS "ProductOperationalSurface" (
	"productId" text PRIMARY KEY REFERENCES "Product" ("id") ON DELETE CASCADE,
	"providerId" text NOT NULL REFERENCES "Provider" ("id") ON DELETE CASCADE,
	"productName" text NOT NULL,
	"productType" text NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"readinessJson" jsonb,
	"subtypeSummary" text,
	"imagePreviewJson" jsonb,
	"coverImageJson" jsonb,
	"variantCount" integer NOT NULL DEFAULT 0,
	"activeVariantCount" integer NOT NULL DEFAULT 0,
	"defaultRatePlanIdsJson" jsonb,
	"policyCoverageStateJson" jsonb,
	"conditionsHref" text,
	"updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProductOperationalSurface_provider_updated_idx"
	ON "ProductOperationalSurface" ("providerId", "updatedAt");

CREATE INDEX IF NOT EXISTS "ProductOperationalSurface_provider_status_idx"
	ON "ProductOperationalSurface" ("providerId", "status");

