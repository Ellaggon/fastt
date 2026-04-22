-- CAPA 6/7: canonical hold contract snapshot.
-- Non-destructive additive migration.

CREATE TABLE IF NOT EXISTS "Hold" (
  "id" TEXT PRIMARY KEY,
  "variantId" TEXT NOT NULL,
  "ratePlanId" TEXT,
  "checkIn" TEXT NOT NULL,
  "checkOut" TEXT NOT NULL,
  "channel" TEXT,
  "expiresAt" INTEGER NOT NULL,
  "policySnapshotJson" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS "Hold_variantId_checkIn_idx" ON "Hold" ("variantId", "checkIn");
CREATE INDEX IF NOT EXISTS "Hold_expiresAt_idx" ON "Hold" ("expiresAt");
