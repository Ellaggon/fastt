-- Materialized product preparation summary for fast workspace/dashboard reads.
-- The deep playbook evaluation can refresh this table after initial render.

CREATE TABLE IF NOT EXISTS "ProductPreparationSnapshot" (
	"productId" TEXT PRIMARY KEY NOT NULL REFERENCES "Product" ("id"),
	"providerId" TEXT NOT NULL REFERENCES "Provider" ("id"),
	"status" TEXT NOT NULL DEFAULT 'draft',
	"statusLabel" TEXT NOT NULL DEFAULT 'En preparación',
	"statusVariant" TEXT NOT NULL DEFAULT 'warning',
	"isPublished" INTEGER NOT NULL DEFAULT 0,
	"readinessPercent" REAL NOT NULL DEFAULT 0,
	"blockerCount" INTEGER NOT NULL DEFAULT 0,
	"blockerPreviewJson" TEXT,
	"readyToPublish" INTEGER NOT NULL DEFAULT 0,
	"continuePreparationHref" TEXT NOT NULL,
	"previewHref" TEXT NOT NULL,
	"nextStepLabel" TEXT,
	"updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "ProductPreparationSnapshot_providerId_updatedAt_idx"
	ON "ProductPreparationSnapshot" ("providerId", "updatedAt");

CREATE INDEX IF NOT EXISTS "ProductPreparationSnapshot_providerId_readyToPublish_idx"
	ON "ProductPreparationSnapshot" ("providerId", "readyToPublish");

CREATE INDEX IF NOT EXISTS "ProductPreparationSnapshot_providerId_status_idx"
	ON "ProductPreparationSnapshot" ("providerId", "status");
