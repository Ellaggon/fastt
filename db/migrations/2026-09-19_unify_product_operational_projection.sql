-- Product preparation is a concern of the product operational projection, not a second cache.
-- Preserve the former snapshot fields as indexed, queryable projection attributes.
ALTER TABLE "ProductOperationalSurface"
	ADD COLUMN IF NOT EXISTS "preparationStatusLabel" text NOT NULL DEFAULT 'En preparación',
	ADD COLUMN IF NOT EXISTS "preparationStatusVariant" text NOT NULL DEFAULT 'warning',
	ADD COLUMN IF NOT EXISTS "isPublished" boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS "readinessPercent" integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "blockerCount" integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "blockerPreviewJson" jsonb,
	ADD COLUMN IF NOT EXISTS "readyToPublish" boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS "continuePreparationHref" text,
	ADD COLUMN IF NOT EXISTS "previewHref" text,
	ADD COLUMN IF NOT EXISTS "nextStepLabel" text,
	ADD COLUMN IF NOT EXISTS "preparationUpdatedAt" timestamptz NOT NULL DEFAULT now();

UPDATE "ProductOperationalSurface" surface
SET
	"preparationStatusLabel" = snapshot."statusLabel",
	"preparationStatusVariant" = snapshot."statusVariant",
	"isPublished" = snapshot."isPublished",
	"readinessPercent" = snapshot."readinessPercent",
	"blockerCount" = snapshot."blockerCount",
	"blockerPreviewJson" = snapshot."blockerPreviewJson",
	"readyToPublish" = snapshot."readyToPublish",
	"continuePreparationHref" = snapshot."continuePreparationHref",
	"previewHref" = snapshot."previewHref",
	"nextStepLabel" = snapshot."nextStepLabel",
	"preparationUpdatedAt" = snapshot."updatedAt"
FROM "ProductPreparationSnapshot" snapshot
WHERE snapshot."productId" = surface."productId";

-- A few operational rows may predate the dedicated snapshot. Preserve any already computed JSON.
UPDATE "ProductOperationalSurface"
SET
	"preparationStatusLabel" = COALESCE(NULLIF("readinessJson" ->> 'statusLabel', ''), "preparationStatusLabel"),
	"preparationStatusVariant" = CASE
		WHEN "readinessJson" ->> 'statusVariant' IN ('success', 'info', 'warning')
			THEN "readinessJson" ->> 'statusVariant'
		ELSE "preparationStatusVariant"
	END,
	"isPublished" = COALESCE(("readinessJson" ->> 'isPublished')::boolean, "isPublished"),
	"readinessPercent" = COALESCE(("readinessJson" ->> 'readinessPercent')::integer, "readinessPercent"),
	"blockerCount" = COALESCE(("readinessJson" ->> 'blockerCount')::integer, "blockerCount"),
	"blockerPreviewJson" = COALESCE("readinessJson" -> 'blockerPreview', "blockerPreviewJson"),
	"readyToPublish" = COALESCE(("readinessJson" ->> 'readyToPublish')::boolean, "readyToPublish"),
	"continuePreparationHref" = COALESCE(NULLIF("readinessJson" ->> 'continuePreparationHref', ''), "continuePreparationHref"),
	"previewHref" = COALESCE(NULLIF("readinessJson" ->> 'previewHref', ''), "previewHref"),
	"nextStepLabel" = COALESCE(NULLIF("readinessJson" ->> 'nextStepLabel', ''), "nextStepLabel")
WHERE "readinessJson" IS NOT NULL;

ALTER TABLE "ProductOperationalSurface"
	DROP COLUMN IF EXISTS "readinessJson";

CREATE INDEX IF NOT EXISTS "ProductOperationalSurface_provider_ready_idx"
	ON "ProductOperationalSurface" ("providerId", "readyToPublish");

ALTER TABLE "ProductOperationalSurface"
	DROP CONSTRAINT IF EXISTS "ProductOperationalSurface_preparation_status_variant_check",
	ADD CONSTRAINT "ProductOperationalSurface_preparation_status_variant_check"
		CHECK ("preparationStatusVariant" IN ('success', 'info', 'warning')),
	DROP CONSTRAINT IF EXISTS "ProductOperationalSurface_readiness_percent_check",
	ADD CONSTRAINT "ProductOperationalSurface_readiness_percent_check"
		CHECK ("readinessPercent" BETWEEN 0 AND 100),
	DROP CONSTRAINT IF EXISTS "ProductOperationalSurface_blocker_count_check",
	ADD CONSTRAINT "ProductOperationalSurface_blocker_count_check"
		CHECK ("blockerCount" >= 0);

DROP TABLE IF EXISTS "ProductPreparationSnapshot";
