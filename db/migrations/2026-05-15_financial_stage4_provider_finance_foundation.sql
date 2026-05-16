CREATE TABLE IF NOT EXISTS "ProviderFinancialProfile" (
  "providerId" TEXT PRIMARY KEY NOT NULL,
  "payoutMethodReference" TEXT,
  "payoutSchedule" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "taxProfileStatus" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ProviderFinancialProfile_status_idx" ON "ProviderFinancialProfile" ("status");
CREATE INDEX IF NOT EXISTS "ProviderFinancialProfile_taxProfileStatus_idx" ON "ProviderFinancialProfile" ("taxProfileStatus");

CREATE TABLE IF NOT EXISTS "CommissionSnapshot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "commissionRate" REAL NOT NULL,
  "commissionAmount" REAL NOT NULL,
  "basis" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "snapshotAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "CommissionSnapshot_booking_provider_idx" ON "CommissionSnapshot" ("bookingId", "providerId");
CREATE INDEX IF NOT EXISTS "CommissionSnapshot_provider_snapshotAt_idx" ON "CommissionSnapshot" ("providerId", "snapshotAt");

CREATE TABLE IF NOT EXISTS "ProviderPayableSnapshot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "grossAmount" REAL NOT NULL,
  "commissionAmount" REAL NOT NULL,
  "taxAmount" REAL NOT NULL,
  "netPayable" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "snapshotAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ProviderPayableSnapshot_booking_provider_idx" ON "ProviderPayableSnapshot" ("bookingId", "providerId");
CREATE INDEX IF NOT EXISTS "ProviderPayableSnapshot_provider_snapshotAt_idx" ON "ProviderPayableSnapshot" ("providerId", "snapshotAt");

CREATE TABLE IF NOT EXISTS "PayoutRecord" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT,
  "providerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payoutReference" TEXT,
  "amount" REAL,
  "currency" TEXT,
  "basis" TEXT NOT NULL,
  "recordedAt" INTEGER,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "PayoutRecord_bookingId_idx" ON "PayoutRecord" ("bookingId");
CREATE INDEX IF NOT EXISTS "PayoutRecord_provider_status_idx" ON "PayoutRecord" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "PayoutRecord_payoutReference_idx" ON "PayoutRecord" ("payoutReference");

CREATE TABLE IF NOT EXISTS "ProviderStatement" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "providerId" TEXT NOT NULL,
  "statementReference" TEXT,
  "periodStart" INTEGER,
  "periodEnd" INTEGER,
  "status" TEXT NOT NULL,
  "totalGrossAmount" REAL NOT NULL,
  "totalCommissionAmount" REAL NOT NULL,
  "totalTaxAmount" REAL NOT NULL,
  "totalNetPayable" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ProviderStatement_provider_status_idx" ON "ProviderStatement" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "ProviderStatement_statementReference_idx" ON "ProviderStatement" ("statementReference");
