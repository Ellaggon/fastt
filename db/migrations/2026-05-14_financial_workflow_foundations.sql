CREATE TABLE IF NOT EXISTS "FinancialExceptionRecord" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "nextOwner" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "openedAt" INTEGER NOT NULL,
  "acknowledgedAt" INTEGER,
  "resolvedAt" INTEGER,
  "resolvedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "FinancialExceptionRecord_bookingId_idx" ON "FinancialExceptionRecord" ("bookingId");
CREATE INDEX IF NOT EXISTS "FinancialExceptionRecord_bookingId_code_idx" ON "FinancialExceptionRecord" ("bookingId", "code");
CREATE INDEX IF NOT EXISTS "FinancialExceptionRecord_providerId_status_idx" ON "FinancialExceptionRecord" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "FinancialExceptionRecord_providerId_code_status_idx" ON "FinancialExceptionRecord" ("providerId", "code", "status");
CREATE INDEX IF NOT EXISTS "FinancialExceptionRecord_providerId_nextOwner_status_idx" ON "FinancialExceptionRecord" ("providerId", "nextOwner", "status");
CREATE INDEX IF NOT EXISTS "FinancialExceptionRecord_openedAt_idx" ON "FinancialExceptionRecord" ("openedAt");

CREATE TABLE IF NOT EXISTS "FinancialReference" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "referenceValue" TEXT NOT NULL,
  "externalSystem" TEXT,
  "amount" REAL,
  "currency" TEXT,
  "recordedAt" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "FinancialReference_bookingId_idx" ON "FinancialReference" ("bookingId");
CREATE INDEX IF NOT EXISTS "FinancialReference_bookingId_type_idx" ON "FinancialReference" ("bookingId", "type");
CREATE INDEX IF NOT EXISTS "FinancialReference_providerId_type_idx" ON "FinancialReference" ("providerId", "type");
CREATE INDEX IF NOT EXISTS "FinancialReference_referenceValue_idx" ON "FinancialReference" ("referenceValue");

CREATE TABLE IF NOT EXISTS "RefundHandoffRecord" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "refundType" TEXT NOT NULL,
  "expectedAmount" REAL,
  "currency" TEXT,
  "basis" TEXT NOT NULL,
  "nextOwner" TEXT NOT NULL,
  "openedAt" INTEGER NOT NULL,
  "acknowledgedAt" INTEGER,
  "closedAt" INTEGER,
  "notes" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "RefundHandoffRecord_bookingId_idx" ON "RefundHandoffRecord" ("bookingId");
CREATE INDEX IF NOT EXISTS "RefundHandoffRecord_providerId_status_idx" ON "RefundHandoffRecord" ("providerId", "status");
CREATE INDEX IF NOT EXISTS "RefundHandoffRecord_providerId_nextOwner_status_idx" ON "RefundHandoffRecord" ("providerId", "nextOwner", "status");
CREATE INDEX IF NOT EXISTS "RefundHandoffRecord_openedAt_idx" ON "RefundHandoffRecord" ("openedAt");

CREATE TABLE IF NOT EXISTS "FinancialReviewEvent" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "bookingId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "financialExceptionId" TEXT,
  "financialReferenceId" TEXT,
  "refundHandoffId" TEXT,
  "type" TEXT NOT NULL,
  "actorId" TEXT,
  "actorType" TEXT NOT NULL,
  "payloadJson" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "FinancialReviewEvent_bookingId_idx" ON "FinancialReviewEvent" ("bookingId");
CREATE INDEX IF NOT EXISTS "FinancialReviewEvent_providerId_createdAt_idx" ON "FinancialReviewEvent" ("providerId", "createdAt");
CREATE INDEX IF NOT EXISTS "FinancialReviewEvent_financialExceptionId_idx" ON "FinancialReviewEvent" ("financialExceptionId");
CREATE INDEX IF NOT EXISTS "FinancialReviewEvent_financialReferenceId_idx" ON "FinancialReviewEvent" ("financialReferenceId");
CREATE INDEX IF NOT EXISTS "FinancialReviewEvent_refundHandoffId_idx" ON "FinancialReviewEvent" ("refundHandoffId");
