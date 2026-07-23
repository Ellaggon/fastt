CREATE TABLE IF NOT EXISTS "SearchMaterializationLog" (
	"id" text PRIMARY KEY NOT NULL,
	"runId" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"variantId" text,
	"productId" text,
	"fromDate" date,
	"toDate" date,
	"horizonDays" integer,
	"currency" text,
	"variantsScanned" integer DEFAULT 0 NOT NULL,
	"rowsMaterialized" integer DEFAULT 0 NOT NULL,
	"purgedRows" integer DEFAULT 0 NOT NULL,
	"durationMs" integer,
	"errorMessage" text,
	"metadataJson" jsonb,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"finishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "SearchMaterializationLog"
	DROP CONSTRAINT IF EXISTS "SearchMaterializationLog_status_check";

ALTER TABLE "SearchMaterializationLog"
	ADD CONSTRAINT "SearchMaterializationLog_status_check"
	CHECK ("status" IN ('running', 'completed', 'failed', 'partial'));

CREATE UNIQUE INDEX IF NOT EXISTS "SearchMaterializationLog_run_unique"
	ON "SearchMaterializationLog" ("runId");

CREATE INDEX IF NOT EXISTS "SearchMaterializationLog_status_created_idx"
	ON "SearchMaterializationLog" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "SearchMaterializationLog_started_idx"
	ON "SearchMaterializationLog" ("startedAt");

CREATE INDEX IF NOT EXISTS "SearchMaterializationLog_variant_started_idx"
	ON "SearchMaterializationLog" ("variantId", "startedAt");

CREATE INDEX IF NOT EXISTS "SearchMaterializationLog_product_started_idx"
	ON "SearchMaterializationLog" ("productId", "startedAt");
