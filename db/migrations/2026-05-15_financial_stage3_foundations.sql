CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "pspProvider" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "PaymentTransaction_bookingId_idx" ON "PaymentTransaction" ("bookingId");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_providerId_type_status_idx" ON "PaymentTransaction" ("providerId", "type", "status");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_providerId_pspProvider_externalReference_idx" ON "PaymentTransaction" ("providerId", "pspProvider", "externalReference");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_idempotencyKey_idx" ON "PaymentTransaction" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_occurredAt_idx" ON "PaymentTransaction" ("occurredAt");

CREATE TABLE IF NOT EXISTS "FinancialSettlementRecord" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "settlementReference" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "settlementDate" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "matchedAt" INTEGER,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "FinancialSettlementRecord_bookingId_idx" ON "FinancialSettlementRecord" ("bookingId");
CREATE INDEX IF NOT EXISTS "FinancialSettlementRecord_providerId_settlementReference_idx" ON "FinancialSettlementRecord" ("providerId", "settlementReference");
CREATE INDEX IF NOT EXISTS "FinancialSettlementRecord_settlementDate_idx" ON "FinancialSettlementRecord" ("settlementDate");

CREATE TABLE IF NOT EXISTS "ReconciliationMatch" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "contractAmount" REAL NOT NULL,
  "paymentAmount" REAL,
  "settlementAmount" REAL,
  "differenceAmount" REAL NOT NULL,
  "status" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "reviewStatus" TEXT,
  "reviewedAt" INTEGER,
  "reviewedBy" TEXT,
  "reviewNote" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "ReconciliationMatch_bookingId_idx" ON "ReconciliationMatch" ("bookingId");
CREATE INDEX IF NOT EXISTS "ReconciliationMatch_providerId_status_idx" ON "ReconciliationMatch" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ReconciliationMatch_providerId_reviewStatus_idx" ON "ReconciliationMatch" ("providerId", "reviewStatus");
CREATE INDEX IF NOT EXISTS "ReconciliationMatch_updatedAt_idx" ON "ReconciliationMatch" ("updatedAt");
