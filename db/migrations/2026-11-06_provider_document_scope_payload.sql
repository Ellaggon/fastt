-- Tighten the additive scope table without changing any legacy provider-wide
-- document. Every scoped evidence row must contain exactly the dimension it
-- claims to represent, so a direct write cannot make one licence stand in for
-- unrelated products, resources, territories or activity classes.
ALTER TABLE "ProviderDocumentScope"
  ADD CONSTRAINT "ProviderDocumentScope_payload_check"
  CHECK (
    ("scopeType" = 'product' AND "productId" IS NOT NULL AND "resourceId" IS NULL AND "territoryCode" IS NULL AND "activityClass" IS NULL)
    OR ("scopeType" = 'resource' AND "resourceId" IS NOT NULL AND "productId" IS NULL AND "territoryCode" IS NULL AND "activityClass" IS NULL)
    OR ("scopeType" = 'territory' AND "territoryCode" IS NOT NULL AND "productId" IS NULL AND "resourceId" IS NULL AND "activityClass" IS NULL)
    OR ("scopeType" = 'activity' AND "activityClass" IS NOT NULL AND "productId" IS NULL AND "resourceId" IS NULL AND "territoryCode" IS NULL)
  );
