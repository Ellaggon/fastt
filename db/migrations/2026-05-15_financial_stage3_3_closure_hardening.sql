ALTER TABLE "FinancialReviewEvent" ADD COLUMN "reconciliationMatchId" TEXT;
CREATE INDEX IF NOT EXISTS "FinancialReviewEvent_reconciliationMatchId_idx" ON "FinancialReviewEvent" ("reconciliationMatchId");

ALTER TABLE "ReconciliationMatch" ADD COLUMN "mismatchReasons" TEXT;
ALTER TABLE "ReconciliationMatch" ADD COLUMN "reviewState" TEXT;
ALTER TABLE "ReconciliationMatch" ADD COLUMN "comparisonFingerprint" TEXT;
ALTER TABLE "ReconciliationMatch" ADD COLUMN "reviewFingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_provider_psp_external_type_unique_idx"
  ON "PaymentTransaction" ("providerId", "pspProvider", "externalReference", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialSettlementRecord_provider_reference_unique_idx"
  ON "FinancialSettlementRecord" ("providerId", "settlementReference");
