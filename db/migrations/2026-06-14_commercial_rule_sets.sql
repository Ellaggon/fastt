CREATE TABLE IF NOT EXISTS "CommercialRuleSet" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "providerId" TEXT NOT NULL REFERENCES "Provider"("id"),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "dateFrom" TEXT,
  "dateTo" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  "archivedAt" INTEGER
);

CREATE INDEX IF NOT EXISTS "CommercialRuleSet_provider_status_idx"
  ON "CommercialRuleSet" ("providerId", "status");

CREATE INDEX IF NOT EXISTS "CommercialRuleSet_provider_dates_idx"
  ON "CommercialRuleSet" ("providerId", "dateFrom", "dateTo");

CREATE TABLE IF NOT EXISTS "CommercialRule" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "providerId" TEXT NOT NULL REFERENCES "Provider"("id"),
  "ruleSetId" TEXT NOT NULL REFERENCES "CommercialRuleSet"("id"),
  "category" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT,
  "value" REAL,
  "configJson" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "CommercialRule_provider_category_type_idx"
  ON "CommercialRule" ("providerId", "category", "type");

CREATE INDEX IF NOT EXISTS "CommercialRule_set_active_idx"
  ON "CommercialRule" ("ruleSetId", "isActive");

CREATE TABLE IF NOT EXISTS "CommercialRuleApplication" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "providerId" TEXT NOT NULL REFERENCES "Provider"("id"),
  "ruleSetId" TEXT NOT NULL REFERENCES "CommercialRuleSet"("id"),
  "ruleId" TEXT NOT NULL REFERENCES "CommercialRule"("id"),
  "scope" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "startDate" TEXT,
  "endDate" TEXT,
  "validDays" TEXT,
  "channel" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS "CommercialRuleApplication_provider_scope_idx"
  ON "CommercialRuleApplication" ("providerId", "scope", "scopeId", "isActive");

CREATE INDEX IF NOT EXISTS "CommercialRuleApplication_rule_scope_idx"
  ON "CommercialRuleApplication" ("ruleId", "scope", "scopeId");

CREATE INDEX IF NOT EXISTS "CommercialRuleApplication_set_active_idx"
  ON "CommercialRuleApplication" ("ruleSetId", "isActive");

DROP TABLE IF EXISTS "PriceRule";
DROP TABLE IF EXISTS "Restriction";
