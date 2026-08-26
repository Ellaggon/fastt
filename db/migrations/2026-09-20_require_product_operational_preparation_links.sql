-- A projection row must always tell the operator where to continue and preview.
-- Backfill deterministic links before making the canonical contract non-nullable.
UPDATE "ProductOperationalSurface"
SET
	"continuePreparationHref" = COALESCE(
		NULLIF("continuePreparationHref", ''),
		'/product/' || "productId" || '/complete-to-publish'
	),
	"previewHref" = COALESCE(
		NULLIF("previewHref", ''),
		'/product/' || "productId" || '/preview'
	);

ALTER TABLE "ProductOperationalSurface"
	ALTER COLUMN "continuePreparationHref" SET NOT NULL,
	ALTER COLUMN "previewHref" SET NOT NULL;
