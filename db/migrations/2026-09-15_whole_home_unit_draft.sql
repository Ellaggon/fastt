-- Physical identity is unique within a provider; bedrooms/beds never generate inventory.
CREATE TABLE IF NOT EXISTS "WholeHomeUnit" (
	"variantId" text PRIMARY KEY REFERENCES "Variant"("id") ON DELETE RESTRICT,
	"productId" text NOT NULL REFERENCES "WholeHome"("productId") ON DELETE RESTRICT,
	"providerId" text NOT NULL REFERENCES "Provider"("id") ON DELETE RESTRICT,
	"resourceId" text NOT NULL REFERENCES "InventoryResource"("id") ON DELETE RESTRICT,
	"physicalKey" text NOT NULL,
	"unitCount" integer NOT NULL DEFAULT 1 CHECK ("unitCount" = 1),
	"createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "WholeHomeUnit_product_unique" ON "WholeHomeUnit" ("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "WholeHomeUnit_resource_unique" ON "WholeHomeUnit" ("resourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "WholeHomeUnit_provider_physical_unique" ON "WholeHomeUnit" ("providerId", "physicalKey");
