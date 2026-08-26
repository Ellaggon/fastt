-- Variant readiness and sales intent previously lived in three overlapping
-- places: Variant.status, Variant.isActive and VariantReadiness. Consolidate
-- them into the Variant aggregate before removing the legacy projection.

ALTER TABLE "Variant"
  ADD COLUMN IF NOT EXISTS "lifecycleState" text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "salesEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lifecycleValidationErrorsJson" jsonb,
  ADD COLUMN IF NOT EXISTS "lifecycleEvaluatedAt" timestamptz NOT NULL DEFAULT now();

-- Preserve the only two distinct legacy meanings. "sellable" was never a
-- lifecycle state; it meant a ready variant whose sale intent was enabled.
UPDATE "Variant"
SET
  "lifecycleState" = CASE
    WHEN lower(coalesce("status", '')) IN ('ready', 'sellable', 'published') THEN 'ready'
    WHEN lower(coalesce("status", '')) = 'archived' THEN 'archived'
    ELSE 'draft'
  END,
  "salesEnabled" = coalesce("isActive", false)
    AND lower(coalesce("status", '')) IN ('ready', 'sellable', 'published'),
  "lifecycleEvaluatedAt" = coalesce("createdAt", now());

-- VariantReadiness held diagnostics only; merge its evidence into the owning
-- aggregate without inventing any successful validation.
UPDATE "Variant" variant
SET
  "lifecycleState" = CASE
    WHEN readiness."state" = 'ready' THEN 'ready'
    ELSE 'draft'
  END,
  "salesEnabled" = CASE
    WHEN readiness."state" = 'ready' THEN coalesce(variant."isActive", false)
    ELSE false
  END,
  "lifecycleValidationErrorsJson" = readiness."validationErrorsJson",
  "lifecycleEvaluatedAt" = coalesce(readiness."updatedAt", variant."lifecycleEvaluatedAt", now())
FROM "VariantReadiness" readiness
WHERE readiness."variantId" = variant."id";

ALTER TABLE "Variant"
  DROP CONSTRAINT IF EXISTS "Variant_lifecycleState_check";

ALTER TABLE "Variant"
  ADD CONSTRAINT "Variant_lifecycleState_check"
  CHECK ("lifecycleState" IN ('draft', 'ready', 'archived'));

ALTER TABLE "Variant"
  DROP CONSTRAINT IF EXISTS "Variant_sales_requires_ready_check";

ALTER TABLE "Variant"
  ADD CONSTRAINT "Variant_sales_requires_ready_check"
  CHECK (NOT "salesEnabled" OR "lifecycleState" = 'ready');

DROP INDEX IF EXISTS "Variant_productId_isActive_idx";
CREATE INDEX IF NOT EXISTS "Variant_product_sales_lifecycle_idx"
  ON "Variant" ("productId", "salesEnabled", "lifecycleState");

ALTER TABLE "Variant"
  DROP COLUMN "status",
  DROP COLUMN "isActive";

DROP TABLE "VariantReadiness";
