CREATE TABLE IF NOT EXISTS "FinancialProviderSummary" (
	"providerId" text PRIMARY KEY REFERENCES "Provider" ("id") ON DELETE CASCADE,
	"summaryJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"collectionsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"refundsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"exceptionsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"settlementsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"computedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"invalidatedAt" timestamp with time zone,
	"invalidationReason" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "FinancialProviderSummary_computedAt_idx"
	ON "FinancialProviderSummary" ("computedAt");

CREATE INDEX IF NOT EXISTS "FinancialProviderSummary_invalidatedAt_idx"
	ON "FinancialProviderSummary" ("invalidatedAt");
