-- Core catalog performance indexes for remote libSQL/Turso navigation.
-- These indexes target high-frequency workspace queries by provider, product,
-- variant, rate plan, and media ownership without changing persisted data.

CREATE INDEX IF NOT EXISTS "Product_providerId_productType_idx"
	ON "Product" ("providerId", "productType");

CREATE INDEX IF NOT EXISTS "Product_providerId_idx"
	ON "Product" ("providerId");

CREATE INDEX IF NOT EXISTS "Variant_productId_isActive_idx"
	ON "Variant" ("productId", "isActive");

CREATE INDEX IF NOT EXISTS "Variant_productId_kind_idx"
	ON "Variant" ("productId", "kind");

CREATE INDEX IF NOT EXISTS "RatePlan_variantId_isActive_idx"
	ON "RatePlan" ("variantId", "isActive");

CREATE INDEX IF NOT EXISTS "RatePlan_variantId_isDefault_isActive_idx"
	ON "RatePlan" ("variantId", "isDefault", "isActive");

CREATE INDEX IF NOT EXISTS "Image_entityType_entityId_idx"
	ON "Image" ("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "Image_entityId_idx"
	ON "Image" ("entityId");
