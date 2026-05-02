BEGIN TRANSACTION;
PRAGMA foreign_keys = OFF;

-- Preconditions are enforced by release runbook preflight queries.
-- This migration is intentionally idempotent across environments where
-- legacy V1 tables may already be absent.

-- Enforce Hold.ratePlanId as required (NOT NULL) via table rebuild.
CREATE TABLE "__Hold_new" (
	"id" TEXT PRIMARY KEY,
	"variantId" TEXT NOT NULL,
	"ratePlanId" TEXT NOT NULL,
	"checkIn" TEXT NOT NULL,
	"checkOut" TEXT NOT NULL,
	"channel" TEXT,
	"expiresAt" INTEGER NOT NULL,
	"policySnapshotJson" TEXT NOT NULL,
	"createdAt" INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
	FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);

INSERT INTO "__Hold_new" (
	"id",
	"variantId",
	"ratePlanId",
	"checkIn",
	"checkOut",
	"channel",
	"expiresAt",
	"policySnapshotJson",
	"createdAt"
)
SELECT
	"id",
	"variantId",
	"ratePlanId",
	"checkIn",
	"checkOut",
	"channel",
	"expiresAt",
	"policySnapshotJson",
	"createdAt"
FROM "Hold";

DROP TABLE "Hold";
ALTER TABLE "__Hold_new" RENAME TO "Hold";

CREATE INDEX IF NOT EXISTS "Hold_variantId_checkIn_idx" ON "Hold" ("variantId", "checkIn");
CREATE INDEX IF NOT EXISTS "Hold_expiresAt_idx" ON "Hold" ("expiresAt");

-- Remove deprecated pricing V1 storage.
DROP TABLE IF EXISTS "PricingBaseRate";
DROP TABLE IF EXISTS "EffectivePricing";

PRAGMA foreign_keys = ON;
COMMIT;
