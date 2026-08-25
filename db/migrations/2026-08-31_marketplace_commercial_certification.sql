-- Commercialization phase: persistent evidence for a controlled development
-- certification that traverses public discovery through booking receipt.

CREATE TABLE IF NOT EXISTS "MarketplaceCommercialCertificationRun" (
	"id" text PRIMARY KEY,
	"suiteVersion" text NOT NULL,
	"status" text NOT NULL DEFAULT 'prepared',
	"providerId" text REFERENCES "Provider" ("id"),
	"hotelProductId" text REFERENCES "Product" ("id"),
	"tourProductId" text REFERENCES "Product" ("id"),
	"checkIn" date,
	"checkOut" date,
	"evidenceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"failureJson" jsonb,
	"startedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "MarketplaceCommercialCertificationRun_status_check"
		CHECK ("status" IN ('prepared', 'running', 'passed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceCommercialCertificationRun_suite_started_unique"
	ON "MarketplaceCommercialCertificationRun" ("suiteVersion", "startedAt");
CREATE INDEX IF NOT EXISTS "MarketplaceCommercialCertificationRun_status_started_idx"
	ON "MarketplaceCommercialCertificationRun" ("status", "startedAt" DESC);
