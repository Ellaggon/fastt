-- CAPA6 schema hardening:
-- 1) Remove dead EffectivePolicy table.
-- 2) Remove legacy RatePlanTemplate.cancellationPolicyId coupling.

DROP TABLE IF EXISTS "EffectivePolicy";

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "RatePlanTemplate_new" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "paymentType" TEXT NOT NULL,
  "refundable" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "RatePlanTemplate_new" (
  "id", "name", "description", "paymentType", "refundable", "createdAt"
)
SELECT
  "id", "name", "description", "paymentType", "refundable", "createdAt"
FROM "RatePlanTemplate";

DROP TABLE "RatePlanTemplate";
ALTER TABLE "RatePlanTemplate_new" RENAME TO "RatePlanTemplate";

PRAGMA foreign_keys=ON;
