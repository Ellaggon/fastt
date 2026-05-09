PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 1) Hold.ratePlanId must be mandatory for canonical Search -> Hold -> Booking invariants.
CREATE TABLE "__new_Hold" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "variantId" TEXT NOT NULL REFERENCES "Variant"("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  "ratePlanId" TEXT NOT NULL REFERENCES "RatePlan"("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  "checkIn" TEXT NOT NULL,
  "checkOut" TEXT NOT NULL,
  "channel" TEXT,
  "expiresAt" INTEGER NOT NULL,
  "policySnapshotJson" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL
);

INSERT INTO "__new_Hold" (
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
FROM "Hold"
WHERE "ratePlanId" IS NOT NULL AND TRIM("ratePlanId") <> '';

DROP TABLE "Hold";
ALTER TABLE "__new_Hold" RENAME TO "Hold";
CREATE INDEX IF NOT EXISTS "Hold_variantId_checkIn_idx" ON "Hold" ("variantId", "checkIn");
CREATE INDEX IF NOT EXISTS "Hold_expiresAt_idx" ON "Hold" ("expiresAt");

-- 2) Drop legacy V1 pricing storage tables. EffectivePricingV2 is the only valid materialized source.
DROP TABLE IF EXISTS "PricingBaseRate";
DROP TABLE IF EXISTS "EffectivePricing";

COMMIT;

PRAGMA foreign_keys = ON;
